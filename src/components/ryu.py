##
## File hoan chinh: dynamic_controller_traffic.py
##
import time
import json
from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER, DEAD_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet, ethernet, ether_types, ipv4
from ryu.lib import hub
from prometheus_client import start_http_server, Counter, Gauge
from ryu.app.wsgi import WSGIApplication, ControllerBase, route
from webob import Response
# REST API URL Prefix
simple_switch_instance_name = 'simple_switch_api'
url_connected_ips = '/connected_ips'
url_blocked_ips = '/blocked_ips'
url_block_ip = '/block_ip'
url_unblock_ip = '/unblock_ip'
url_ports = '/ports'
url_block_port = '/block_port'
url_unblock_port = '/unblock_port'

class SimpleSwitch13(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    _CONTEXTS = {'wsgi': WSGIApplication}

    def __init__(self, *args, **kwargs):
        super(SimpleSwitch13, self).__init__(*args, **kwargs)
        start_http_server(8000, addr="0.0.0.0")  # Expose metrics here
        # Prometheus counter
        global packet_in_counter
        packet_in_counter = Counter('ryu_packet_in_total', 'Number of packet-in messages')

         # Prometheus Gauges (lưu vào self để dùng ở các hàm khác)
        self.port_rx_throughput_gauge = Gauge('ryu_port_rx_throughput', 'Port RX Throughput (bytes/s)', ['dpid', 'port'])
        self.port_tx_throughput_gauge = Gauge('ryu_port_tx_throughput', 'Port TX Throughput (bytes/s)', ['dpid', 'port'])
        
        self.connected_hosts_gauge = Gauge('ryu_connected_hosts', 'Number of connected hosts', ['dpid'])

        self.mac_to_port = {}
        self.datapaths = {}
        self.port_stats = {}
        self.port_throughput = {}
        self.security_priority = 100
        
        # Load link bandwidth from file
        self.link_bandwidth = self._load_link_bandwidth('/home/ryu/Downloads/link_bandwidth.json')
        
        # Initialize dynamic threshold based on bandwidth
        self.initial_threshold = self.calculate_initial_threshold()
        
        self.throughput_history = {}
        self.monitor_thread = hub.spawn(self._monitor)
        
        # Dictionary to track blocked ports and their last exceeded time
        self.blocked_ports = {}

        # Dictionary to track the time throughput has stayed below threshold
        self.below_threshold_time = {}

        # Dictionary to track the time throughput has been above threshold
        self.above_threshold_time = {}

        # Timeout for unlocking a port 
        self.unlock_timeout = 10  # seconds

        # Time that throughput must stay above threshold to trigger block
        self.block_window = 5  # seconds

        # Dictionary to track the last unblock time of ports
        self.last_unblock_time = {}

        # Timestamp for the last log
        self.last_log_time = time.time()

        self.blocked_ips = set()

        #Show IP Connect
        self.hosts = set()

        self.ip_to_port = {}  # Dạng: {dpid: {ip: port}}

         # Khởi tạo API
        wsgi = kwargs['wsgi']
        wsgi.register(SimpleSwitchController, {simple_switch_instance_name: self})

    def _load_link_bandwidth(self, file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error('Could not load link bandwidth file: %s', e)
            return {}

    def calculate_initial_threshold(self):
        # Calculate initial threshold based on the bandwidth of the first link in topology
        try:
            first_link_bandwidth = next(iter(self.link_bandwidth.values()))  # Get the bandwidth of the first link
            first_link_bandwidth_value = next(iter(first_link_bandwidth.values()))  # Get the bandwidth value
            initial_threshold = ((first_link_bandwidth_value / 8) * 10**6) * 0.8  # Use 80% of the bandwidth as initial threshold
            return initial_threshold
        except Exception as e:
            self.logger.error('Error calculating initial threshold: %s', e)
            return 750000  # Default value if calculation fails (0.75MBps)

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)
        
        self.datapaths[datapath.id] = datapath

    def add_flow(self, datapath, priority, match, actions, buffer_id=None):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]
        if buffer_id:
            mod = parser.OFPFlowMod(datapath=datapath, buffer_id=buffer_id,
                                    priority=priority, match=match,
                                    instructions=inst)
        else:
            mod = parser.OFPFlowMod(datapath=datapath, priority=priority,
                                    match=match, instructions=inst)
        datapath.send_msg(mod)

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def _packet_in_handler(self, ev):
        packet_in_counter.inc()
        if ev.msg.msg_len < ev.msg.total_len:
            self.logger.debug("packet truncated: only %s of %s bytes",
                              ev.msg.msg_len, ev.msg.total_len)
        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        in_port = msg.match['in_port']

        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocols(ethernet.ethernet)[0]

        if eth.ethertype == ether_types.ETH_TYPE_LLDP:
            return
        
        dpid = datapath.id

        ip_pkt = pkt.get_protocol(ipv4.ipv4)
        if ip_pkt:
            src_ip = ip_pkt.src
            
            # Khởi tạo ip_to_port cho dpid nếu chưa tồn tại
            self.ip_to_port.setdefault(dpid, {})
            
            # Kiểm tra xem IP đã tồn tại hay chưa
            if src_ip in self.ip_to_port[dpid]:
                existing_port = self.ip_to_port[dpid][src_ip]
                # Nếu IP đã tồn tại nhưng trên cổng khác, cập nhật cổng mới
                if existing_port != in_port:
                    self.logger.warning(
                        "IP %s moved from port %s to port %s on switch %s",
                        src_ip, existing_port, in_port, dpid
                    )
            else:
                # Nếu IP chưa tồn tại, thêm mới
                self.logger.info("IP %s connected to switch %s at port %s", src_ip, dpid, in_port)
            
            # Cập nhật cổng cho IP
            self.ip_to_port[dpid][src_ip] = in_port

        dst = eth.dst
        src = eth.src

        
        self.mac_to_port.setdefault(dpid, {})

        self.logger.info("packet in %s %s %s %s", dpid, src, dst, in_port)

        self.mac_to_port[dpid][src] = in_port

        connected_host_count = len(self.mac_to_port[dpid])
        self.connected_hosts_gauge.labels(dpid=str(dpid)).set(connected_host_count)


        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            if msg.buffer_id != ofproto.OFP_NO_BUFFER:
                self.add_flow(datapath, 1, match, actions, msg.buffer_id)
                return
            else:
                self.add_flow(datapath, 1, match, actions)
        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)

    @set_ev_cls(ofp_event.EventOFPStateChange,
                [MAIN_DISPATCHER, DEAD_DISPATCHER])
    def _state_change_handler(self, ev):
        datapath = ev.datapath
        if ev.state == MAIN_DISPATCHER:
            if datapath.id not in self.datapaths:
                self.logger.info('register datapath: %016x', datapath.id)
                self.datapaths[datapath.id] = datapath
        elif ev.state == DEAD_DISPATCHER:
            if datapath.id in self.datapaths:
                self.logger.info('unregister datapath: %016x', datapath.id)
                del self.datapaths[datapath.id]

    def _monitor(self):
        while True:
            for dp in self.datapaths.values():
                self._request_stats(dp)
            hub.sleep(1)  # Check throughput every second

    def _request_stats(self, datapath):
        self.logger.debug('send stats request: %016x', datapath.id)
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        req = parser.OFPFlowStatsRequest(datapath)
        datapath.send_msg(req)

        req = parser.OFPPortStatsRequest(datapath, 0, ofproto.OFPP_ANY)
        datapath.send_msg(req)

    @set_ev_cls(ofp_event.EventOFPPortStatsReply, MAIN_DISPATCHER)
    def _port_stats_reply_handler(self, ev):
        # Extract the body of the message containing port statistics
        body = ev.msg.body
        
        # Get the datapath ID from the event message
        dpid = ev.msg.datapath.id
        
        # Initialize dictionaries to store port statistics, throughput, and history if not already initialized
        self.port_stats.setdefault(dpid, {})
        self.port_throughput.setdefault(dpid, {})
        self.throughput_history.setdefault(dpid, {})
        
        # Get the current timestamp for calculating throughput intervals
        timestamp = time.time()

        # Iterate through each port's statistics in the message body
        for stat in body:
            # Extract port number, received bytes, and transmitted bytes from the statistics
            port_no = stat.port_no
            rx_bytes = stat.rx_bytes
            tx_bytes = stat.tx_bytes

            # If port statistics for this datapath and port number are not yet recorded, initialize them
            if port_no not in self.port_stats[dpid]:
                self.port_stats[dpid][port_no] = {'rx_bytes': rx_bytes, 'tx_bytes': tx_bytes, 'timestamp': timestamp}
                continue

            # Calculate the time interval since the last recorded statistics
            prev_stats = self.port_stats[dpid][port_no]
            interval = timestamp - prev_stats['timestamp']

            # Calculate throughput rates in bytes per second for both receive and transmit directions
            rx_throughput = (rx_bytes - prev_stats['rx_bytes']) / interval
            tx_throughput = (tx_bytes - prev_stats['tx_bytes']) / interval

            # Record the calculated throughput rates in the throughput dictionary
            self.port_throughput[dpid][port_no] = {'rx_throughput': rx_throughput, 'tx_throughput': tx_throughput}

            self.port_rx_throughput_gauge.labels(dpid=str(dpid), port=str(port_no)).set(rx_throughput)
            # Update the port statistics with the current values and timestamp
            self.port_stats[dpid][port_no] = {'rx_bytes': rx_bytes, 'tx_bytes': tx_bytes, 'timestamp': timestamp}

            # Check if the current throughput exceeds the dynamic threshold and take appropriate actions
            self.check_port_threshold(dpid, port_no, rx_throughput, tx_throughput, timestamp)

        # Log port statistics every 10 seconds
        if timestamp - self.last_log_time >= 10:
            for dpid in self.port_throughput:
                for port_no in self.port_throughput[dpid]:
                    rx_throughput = self.port_throughput[dpid][port_no]['rx_throughput']
                    tx_throughput = self.port_throughput[dpid][port_no]['tx_throughput']
                    dynamic_threshold = self.link_bandwidth.get(str(dpid), {}).get(str(port_no), self.initial_threshold)
                    self.logger.info('Port %s on switch %s - RX: %s bytes/s, TX: %s bytes/s, Threshold: %s bytes/s',
                                    port_no, dpid, rx_throughput, tx_throughput, dynamic_threshold)
            self.last_log_time = timestamp


    def check_port_threshold(self, dpid, port_no, rx_throughput, tx_throughput, timestamp):
        # Calculate the dynamic threshold based on configured link bandwidth or use default
        dynamic_threshold = self.link_bandwidth.get(str(dpid), {}).get(str(port_no), self.initial_threshold)
        
        # Check if current throughput exceeds the dynamic threshold
        if (rx_throughput > dynamic_threshold or tx_throughput > dynamic_threshold):
            # If port is not already marked as above threshold, record the time
            if (dpid, port_no) not in self.above_threshold_time:
                self.above_threshold_time[(dpid, port_no)] = timestamp
            # If the port has been above threshold for longer than block window, block it
            elif timestamp - self.above_threshold_time[(dpid, port_no)] > self.block_window:
                # If port is not already blocked, log a warning and block the port
                print(f"Real-time throughput on port {port_no} of switch {dpid}: RX={rx_throughput}, TX={tx_throughput}, Threshold={dynamic_threshold}")
                if (dpid, port_no) not in self.blocked_ports:
                    self.logger.warning('Threshold exceeded on port %s of switch %s', port_no, dpid)
                    self._block_port(dpid, port_no)
                    self.blocked_ports[(dpid, port_no)] = timestamp  # Record the time when the port was blocked
                    self.below_threshold_time[(dpid, port_no)] = None  # Reset the below threshold timer
        else:
            # If port was marked as above threshold, remove the record
            if (dpid, port_no) in self.above_threshold_time:
                del self.above_threshold_time[(dpid, port_no)]
            # If port is currently blocked, track the time it remains below threshold
            if (dpid, port_no) in self.blocked_ports:
                if self.below_threshold_time.get((dpid, port_no)) is None:
                    self.below_threshold_time[(dpid, port_no)] = timestamp
                # If the port has been below threshold long enough, unblock it
                elif timestamp - self.below_threshold_time[(dpid, port_no)] > self.unlock_timeout:
                    del self.blocked_ports[(dpid, port_no)]
                    del self.below_threshold_time[(dpid, port_no)]
                    self._unblock_port(dpid, port_no)

            # Check if the port was recently unblocked and exceeds threshold again within 1 second
            if (dpid, port_no) in self.last_unblock_time and self.last_unblock_time[(dpid, port_no)] is not None:
                if timestamp - self.last_unblock_time[(dpid, port_no)] <= 1 and (rx_throughput > dynamic_threshold or tx_throughput > dynamic_threshold):
                    self.logger.warning('Threshold exceeded again on port %s of switch %s within 1 second of unblock', port_no, dpid)
                    self._block_port(dpid, port_no)
                    self.blocked_ports[(dpid, port_no)] = timestamp  # Record the time when the port was blocked

                    
    def _block_port(self, dpid, port_no):
        datapath = self.datapaths.get(dpid)
        if datapath is None:
            self.logger.error('Datapath %s not found', dpid)
            return
        
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        
        match = parser.OFPMatch(
            in_port=port_no,
            eth_type=0x0800,  # IPv4
            ip_proto=1        # ICMP
        )      
        actions = []  # Drop all packets
        self.add_flow(datapath, self.security_priority, match, actions)
        
        self.logger.info('\n---\n---\nBlocking port %s on switch %s\n---\n---\n', port_no, dpid)
        self.last_unblock_time[(dpid, port_no)] = None  # Reset last unblock time

    def _unblock_port(self, dpid, port_no):
        datapath = self.datapaths.get(dpid)
        if datapath is None:
            self.logger.error('Datapath %s not found', dpid)
            return
        
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        
        # Match the specific rule we want to delete (i.e., the block rule)
        match = parser.OFPMatch(
                in_port=port_no,
                eth_type=0x0800,  
                ip_proto=1 )
        mod = parser.OFPFlowMod(
            datapath=datapath,
            command=ofproto.OFPFC_DELETE_STRICT,  # Use DELETE_STRICT to delete specific flow
            out_port=ofproto.OFPP_ANY,
            out_group=ofproto.OFPG_ANY,
            match=match,
            priority=self.security_priority  # Use the same priority as the block rule
        )
        datapath.send_msg(mod)
        
        self.logger.info('\n---\n---\nUnblocking port %s on switch %s\n---\n---\n', port_no, dpid)
        self.last_unblock_time[(dpid, port_no)] = time.time()  # Record the time when the port was unblocked

    def block_ip(self, datapath, ip_addr):
        parser = datapath.ofproto_parser
        match = parser.OFPMatch(eth_type=0x0800, ipv4_src=ip_addr)  # Chặn gói tin từ IP nguồn
        actions = []  # Không có hành động => Drop
        self.add_flow(datapath, self.security_priority, match, actions)
    
    def unblock_ip(self, datapath, ip_addr):
        parser = datapath.ofproto_parser
        match = parser.OFPMatch(eth_type=0x0800, ipv4_src=ip_addr)  # Xóa luật chặn IP nguồn
        mod = parser.OFPFlowMod(datapath=datapath, command=datapath.ofproto.OFPFC_DELETE,
                                out_port=datapath.ofproto.OFPP_ANY, out_group=datapath.ofproto.OFPG_ANY,
                                match=match)
        datapath.send_msg(mod)

class SimpleSwitchController(ControllerBase):
    def __init__(self, req, link, data, **config):
        super(SimpleSwitchController, self).__init__(req, link, data, **config)
        self.simple_switch_app = data[simple_switch_instance_name]

    @route('connected_ips', url_connected_ips, methods=['GET'])
    def list_connected_ips(self, req, **kwargs):
        body = json.dumps(list(self.simple_switch_app.hosts))
        return Response(content_type='application/json; charset=utf-8', body=body)

    @route('blocked_ips', url_blocked_ips, methods=['GET'])
    def list_blocked_ips(self, req, **kwargs):
        body = json.dumps(list(self.simple_switch_app.blocked_ips))
        return Response(content_type='application/json; charset=utf-8', body=body)

    @route('block_ip', url_block_ip, methods=['POST'])
    def block_ip(self, req, **kwargs):
        try:
            new_data = req.json if req.body else {}
            ip = new_data.get('ip')
            if not ip:
                return Response(status=400, body="Missing IP address.")
            if ip in self.simple_switch_app.blocked_ips:
                return Response(status=400, body="IP already blocked.")
            self.simple_switch_app.blocked_ips.add(ip)
            for dp in self.simple_switch_app.datapaths.values():
                self.simple_switch_app.block_ip(dp, ip)
            return Response(status=200, body="Blocked IP: {}".format(ip))
        except Exception as e:
            return Response(status=500, body=str(e))

    @route('unblock_ip', url_unblock_ip, methods=['POST'])
    def unblock_ip(self, req, **kwargs):
        try:
            new_data = req.json if req.body else {}
            ip = new_data.get('ip')
            if not ip:
                return Response(status=400, body="Missing IP address.")
            if ip not in self.simple_switch_app.blocked_ips:
                return Response(status=400, body="IP not in blocked list.")
            self.simple_switch_app.blocked_ips.remove(ip)
            for dp in self.simple_switch_app.datapaths.values():
                self.simple_switch_app.unblock_ip(dp, ip)
            return Response(status=200, body="Unblocked IP: {}".format(ip))
        except Exception as e:
            return Response(status=500, body=str(e))

    # Api Port --------------------------------------------------------------------
    @route('ports', url_ports, methods=['GET'])
    def list_ports(self, req, **kwargs):
        # Trả về danh sách tất cả các cổng và cổng bị chặn trên tất cả switch
        ports_info = {}
        for dpid, datapath in self.simple_switch_app.datapaths.items():
            # Lấy danh sách mô tả các cổng từ switch
            port_list = []
            for port_no, port_desc in datapath.ports.items():
                port_list.append({
                    "port_no": port_no,
                    "name": port_desc.name.decode('utf-8'),
                    "hw_addr": port_desc.hw_addr
                })

            # Lấy danh sách cổng bị chặn từ blocked_ports
            blocked_ports = list(self.simple_switch_app.blocked_ports.get(dpid, set()))

            # Thêm thông tin vào kết quả trả về
            ports_info[str(dpid)] = {
                "all_ports": port_list,
                "blocked_ports": blocked_ports
            }
        body = json.dumps(ports_info)
        return Response(content_type='application/json; charset=utf-8', body=body)

    @route('block_port', url_block_port, methods=['POST'])
    def block_port(self, req, **kwargs):
        switch_app = self.simple_switch_app
        try:
            # Đảm bảo dữ liệu JSON đầu vào hợp lệ
            data = json.loads(req.body)
            dpid = int(data['dpid'])
            port_no = int(data['port_no'])

            # Gọi hàm để chặn cổng
            switch_app._block_port(dpid, port_no)
            return Response(
                content_type='application/json; charset=utf-8',
                body=json.dumps({'status': 'success'})
            )
        except Exception as e:
            # Trả về lỗi dưới dạng JSON
            error_message = {'status': 'error', 'message': str(e)}
            return Response(
                status=500,
                content_type='application/json; charset=utf-8',
                body=json.dumps(error_message)
            )

    @route('unblock_port', url_unblock_port, methods=['POST'])
    def unblock_port(self, req, **kwargs):
        switch_app = self.simple_switch_app
        try:
            # Đảm bảo dữ liệu JSON đầu vào hợp lệ
            data = json.loads(req.body)
            dpid = int(data['dpid'])
            port_no = int(data['port_no'])

            # Gọi hàm để mở chặn cổng
            switch_app._unblock_port(dpid, port_no)
            return Response(
                content_type='application/json; charset=utf-8',
                body=json.dumps({'status': 'success'})
            )
        except Exception as e:
            # Trả về lỗi dưới dạng JSON
            error_message = {'status': 'error', 'message': str(e)}
            return Response(
                status=500,
                content_type='application/json; charset=utf-8',
                body=json.dumps(error_message)
            )
    
    # @route('ip_to_port', '/ip_to_port', methods=['GET'])
    # def list_ip_to_port(self, req, **kwargs):
    #     """
    #     Trả về danh sách IP và cổng mà chúng kết nối với từng switch.
    #     """
    #     ip_to_port_info = {}
    #     for dpid, ip_ports in self.simple_switch_app.ip_to_port.items():
    #         ip_to_port_info[str(dpid)] = [
    #             {"ip": ip, "port": port} for ip, port in ip_ports.items()
    #         ]
        
    #     body = json.dumps(ip_to_port_info, indent=4)
    #     return Response(content_type='application/json; charset=utf-8', body=body)
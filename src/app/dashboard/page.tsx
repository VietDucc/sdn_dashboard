"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_BASE = "http://192.168.141.128:8080";

export default function Dashboard() {
  const router = useRouter();
  const [connectedIps, setConnectedIps] = useState<string[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [ports, setPorts] = useState<any>({});
  const [thresholds, setThresholds] = useState<{ [key: string]: any[] }>({});
  const [newThresholds, setNewThresholds] = useState<{ [key: string]: { [port: number]: string } }>({});
  const [errors, setErrors] = useState<{ [key: string]: { [port: number]: string } }>({});
  const [hostToSwitch, setHostToSwitch] = useState<{ ip: string; switch: string; port: number }[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  const fetchIps = async () => {
    const [connected, blocked] = await Promise.all([
      fetch(`${API_BASE}/connected_ips`).then((res) => res.json()),
      fetch(`${API_BASE}/blocked_ips`).then((res) => res.json()),
    ]);
    setConnectedIps(connected);
    setBlockedIps(blocked);
  };

  const fetchPorts = async () => {
    const res = await fetch(`${API_BASE}/ports`);
    const data = await res.json();
    setPorts(data);
  };

  const fetchThresholds = async () => {
    const res = await fetch(`${API_BASE}/thresholds`);
    const data = await res.json();
    setThresholds(data);

    const initialInputs: { [key: string]: { [port: number]: string } } = {};

    Object.entries(data).forEach(([dpid, portList]) => {
      initialInputs[dpid] = {};
      (portList as Array<{ port: number; threshold: number }>).forEach((port) => {
        initialInputs[dpid][port.port] = port.threshold.toString();
      });
    });
    setNewThresholds(initialInputs);
  };

  const fetchHostToSwitch = async () => {
    const res = await fetch(`${API_BASE}/host_to_switch`);
    const data = await res.json();
    setHostToSwitch(data);
  };

  const blockIp = async () => {
    await fetch(`${API_BASE}/block_ip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: newIp }),
    });
    setNewIp("");
    fetchIps();
  };

  const unblockIp = async (ip: string) => {
    await fetch(`${API_BASE}/unblock_ip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    fetchIps();
  };

  const blockPort = async (dpid: string, port_no: number) => {
    await fetch(`${API_BASE}/block_port`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dpid, port_no }),
    });
    fetchPorts();
  };

  const unblockPort = async (dpid: string, port_no: number) => {
    await fetch(`${API_BASE}/unblock_port`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dpid, port_no }),
    });
    fetchPorts();
  };

  const updateThreshold = async (dpid: string, port: number, max_threshold: number) => {
  const value = parseFloat(newThresholds[dpid]?.[port]);
  if (isNaN(value)) {
    setErrors((prev) => ({
      ...prev,
      [dpid]: {
        ...prev[dpid],
        [port]: "Invalid number",
      },
    }));
    return;
  }

  const res = await fetch(`${API_BASE}/threshold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ switch: parseInt(dpid), port, threshold: value }]),
  });

  const result: string[] = await res.json();

  // Tìm lỗi trong mảng kết quả backend trả về
  const errorMsg = result.find((msg) => msg.toLowerCase().startsWith("error"));

  if (errorMsg) {
    // Hiển thị lỗi lên UI
    setErrors((prev) => ({
      ...prev,
      [dpid]: {
        ...prev[dpid],
        [port]: errorMsg,
      },
    }));
    return; // Dừng ở đây không gọi fetchThresholds
  }

  // Nếu không lỗi thì clear lỗi và refresh thresholds
  setErrors((prev) => ({
    ...prev,
    [dpid]: {
      ...prev[dpid],
      [port]: "",
    },
  }));

  fetchThresholds();
  };


  useEffect(() => {
    fetchIps();
    fetchPorts();
    fetchThresholds();
    fetchHostToSwitch();
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem("token");
            router.push("/login");
          }}
        >
          Logout
        </Button>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Connected IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Connected IPs</CardTitle>
          </CardHeader>
          <CardContent>
            {connectedIps.map((ip) => (
              <div key={ip}>{ip}</div>
            ))}
          </CardContent>
        </Card>

        {/* Blocked IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Blocked IPs</CardTitle>
          </CardHeader>
          <CardContent>
            {blockedIps.map((ip) => (
              <div key={ip} className="flex justify-between items-center py-1">
                <span>{ip}</span>
                <Button variant="destructive" size="sm" onClick={() => unblockIp(ip)}>
                  Unblock
                </Button>
              </div>
            ))}
            <div className="mt-4 flex gap-2">
              <Input
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="Enter IP to block"
              />
              <Button onClick={blockIp}>Block</Button>
            </div>
          </CardContent>
        </Card>

        {/* Host to Switch Mapping */}
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Host Connections</CardTitle>
          </CardHeader>
          <CardContent>
            {hostToSwitch.length === 0 && <p>No host connection data.</p>}
            {hostToSwitch.map((entry, index) => (
              <div key={index} className="py-1">
                <span>
                  IP <strong>{entry.ip}</strong> → Switch <strong>{entry.switch}</strong>, Port{" "}
                  <strong>{entry.port}</strong>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Switch Thresholds */}
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Switch Thresholds</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(thresholds).map(([dpid, ports]) => (
              <div key={dpid} className="mb-6">
                <h3 className="font-semibold text-lg mb-2">{dpid}</h3>
                {ports.map((portInfo) => (
                  <div key={portInfo.port} className="flex items-center gap-4 mb-2 ml-4">
                    <span>Port {portInfo.port}:</span>
                    <Input
                      type="number"
                      value={newThresholds[dpid]?.[portInfo.port] ?? portInfo.threshold}
                      onChange={(e) =>
                        setNewThresholds((prev) => ({
                          ...prev,
                          [dpid]: {
                            ...prev[dpid],
                            [portInfo.port]: e.target.value,
                          },
                        }))
                      }
                      className="w-36"
                    />
                    <Button onClick={() => updateThreshold(dpid, portInfo.port, portInfo.max_threshold)}>
                      Update
                    </Button>
                    {errors[dpid]?.[portInfo.port] && (
                      <span className="text-red-500 text-sm">{errors[dpid][portInfo.port]}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Switch Ports */}
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Switch Ports</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(ports).map(([dpid, info]: any) => (
              <div key={dpid} className="mb-6">
                <h3 className="font-bold text-lg mb-2">Switch: {dpid}</h3>
                <table className="w-full border text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-2 py-1">Port No</th>
                      <th className="border px-2 py-1">Name</th>
                      <th className="border px-2 py-1">HW Addr</th>
                      <th className="border px-2 py-1">Status</th>
                      <th className="border px-2 py-1">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.all_ports.map((port: any) => (
                      <tr key={port.port_no}>
                        <td className="border px-2 py-1">{port.port_no}</td>
                        <td className="border px-2 py-1">{port.name}</td>
                        <td className="border px-2 py-1">{port.hw_addr}</td>
                        <td className="border px-2 py-1">
                          {info.blocked_ports.includes(port.port_no) ? "Blocked" : "Active"}
                        </td>
                        <td className="border px-2 py-1">
                          {info.blocked_ports.includes(port.port_no) ? (
                            <Button size="sm" variant="default" onClick={() => unblockPort(dpid, port.port_no)}>
                              Unblock
                            </Button>
                          ) : (
                            <Button size="sm" variant="destructive" onClick={() => blockPort(dpid, port.port_no)}>
                              Block
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network/standalone';

const Topology: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [network, setNetwork] = useState<Network | null>(null);

  useEffect(() => {
    const fetchTopology = async () => {
      try {
        const res = await fetch('http://192.168.141.128:8080/topology'); 
        const data = await res.json();

        const nodes = [];
        const edges = [];

        // Thêm các switch vào nodes
        for (const sw of data.switches) {
          nodes.push({
            id: `s${sw.dpid}`,
            label: `Switch ${sw.dpid}`,
            shape: 'box',
            color: '#3399ff'
          });
        }

        // Thêm các host vào nodes
        for (const host of data.hosts) {
          nodes.push({
            id: host.mac,
            label: host.ip ? `${host.ip} (${host.mac})` : host.mac,
            shape: 'ellipse',
            color: '#66cc66'
          });

          edges.push({
            from: `s${host.dpid}`,
            to: host.mac,
            label: `port ${host.port}`,
            font: { align: 'top' }
          });
        }

        // Thêm links giữa switch
        for (const link of data.links) {
          edges.push({
            from: `s${link.src}`,
            to: `s${link.dst}`,
            label: `(${link.src_port}↔${link.dst_port})`,
            arrows: 'to',
            font: { align: 'top' }
          });
        }

        const visData = { nodes, edges };
        const options = {
          physics: {
            stabilization: true
          },
          layout: {
            improvedLayout: true
          }
        };

        if (containerRef.current) {
          const visNetwork = new Network(containerRef.current, visData, options);
          setNetwork(visNetwork);
        }
      } catch (err) {
        console.error('Failed to fetch topology:', err);
      }
    };

    fetchTopology();
  }, []);

  return <div ref={containerRef} style={{ height: '600px', border: '1px solid #ccc' }} />;
};

export default Topology;

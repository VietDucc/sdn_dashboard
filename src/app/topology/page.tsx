'use client';
import React from 'react';
import Topology from '@/components/topology';

const TopologyPage = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Mô phỏng Topology SDN</h1>
      <Topology />
    </div>
  );
};

export default TopologyPage;

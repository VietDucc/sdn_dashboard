import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wifi,
  WifiOff,
  Radio,
  BluetoothOffIcon as RadioOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface NetworkStatsProps {
  stats: {
    connectedCount: number;
    blockedCount: number;
    portsCount: number;
    blockedPortsCount: number;
  };
  isLoading: boolean;
}

export function NetworkStats({ stats, isLoading }: NetworkStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Connected IPs</CardTitle>
          <Wifi className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{stats.connectedCount}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Blocked IPs</CardTitle>
          <WifiOff className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{stats.blockedCount}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Ports</CardTitle>
          <Radio className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{stats.portsCount}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Blocked Ports</CardTitle>
          <RadioOff className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{stats.blockedPortsCount}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

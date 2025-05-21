"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ConnectedIP {
  ip: string;
  hostname: string;
  lastSeen: string;
}

export default function ConnectedIPs({ onUpdate }: { onUpdate: () => void }) {
  const [connectedIPs, setConnectedIPs] = useState<ConnectedIP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [blockingIP, setBlockingIP] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchConnectedIPs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get("/connected_ips");
      setConnectedIPs(response.data);
    } catch (err) {
      setError("Failed to fetch connected IPs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectedIPs();
  }, []);

  const blockIP = async (ip: string) => {
    try {
      setBlockingIP(ip);
      await axios.post("/block_ip", { ip });
      toast({
        title: "IP Blocked",
        description: `${ip} has been successfully blocked.`,
      });
      fetchConnectedIPs();
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to block IP",
        description: "An error occurred while trying to block the IP.",
        variant: "destructive",
      });
    } finally {
      setBlockingIP(null);
    }
  };

  const filteredIPs = connectedIPs.filter(
    (ip) =>
      ip.ip.includes(searchTerm) ||
      ip.hostname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search IPs or hostnames..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant="outline"
          onClick={fetchConnectedIPs}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            "Refresh"
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredIPs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No connected IPs found.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP Address</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIPs.map((ip) => (
                <TableRow key={ip.ip}>
                  <TableCell className="font-mono">{ip.ip}</TableCell>
                  <TableCell>{ip.hostname}</TableCell>
                  <TableCell>
                    {new Date(ip.lastSeen).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => blockIP(ip.ip)}
                      disabled={blockingIP === ip.ip}
                    >
                      {blockingIP === ip.ip ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="mr-2 h-4 w-4" />
                      )}
                      Block
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

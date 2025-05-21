"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Loader2, Unlock } from "lucide-react";
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

interface BlockedIP {
  ip: string;
  reason: string;
  blockedAt: string;
}
interface Port {
  port: number;
  service: string;
  protocol: string;
  blocked: boolean;
}
export default function BlockedIPs({ onUpdate }: { onUpdate: () => void }) {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [unblockingIP, setUnblockingIP] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBlockedIPs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get("/blocked_ips");
      setBlockedIPs(response.data);
    } catch (err) {
      setError("Failed to fetch blocked IPs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedIPs();
  }, []);

  const unblockIP = async (ip: string) => {
    try {
      setUnblockingIP(ip);
      await axios.post("/unblock_ip", { ip });
      toast({
        title: "IP Unblocked",
        description: `${ip} has been successfully unblocked.`,
      });
      fetchBlockedIPs();
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to unblock IP",
        description: "An error occurred while trying to unblock the IP.",
        variant: "destructive",
      });
    } finally {
      setUnblockingIP(null);
    }
  };

  const filteredIPs = blockedIPs.filter(
    (ip) =>
      ip.ip.includes(searchTerm) ||
      ip.reason.toLowerCase().includes(searchTerm.toLowerCase())
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
          placeholder="Search IPs or reasons..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant="outline"
          onClick={fetchBlockedIPs}
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
          No blocked IPs found.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP Address</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Blocked At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIPs.map((ip) => (
                <TableRow key={ip.ip}>
                  <TableCell className="font-mono">{ip.ip}</TableCell>
                  <TableCell>{ip.reason}</TableCell>
                  <TableCell>
                    {new Date(ip.blockedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unblockIP(ip.ip)}
                      disabled={unblockingIP === ip.ip}
                    >
                      {unblockingIP === ip.ip ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      Unblock
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

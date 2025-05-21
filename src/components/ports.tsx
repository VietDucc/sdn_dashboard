"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Ban, Loader2, Unlock } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

interface Port {
  port: number;
  service: string;
  protocol: string;
  blocked: boolean;
}

export default function Ports({ onUpdate }: { onUpdate: () => void }) {
  const [ports, setPorts] = useState<Port[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [processingPort, setProcessingPort] = useState<number | null>(null);
  const { toast } = useToast();

  const fetchPorts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get("/ports");
      setPorts(response.data);
    } catch (err) {
      setError("Failed to fetch ports. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const blockPort = async (port: number) => {
    try {
      setProcessingPort(port);
      await axios.post("/block_port", { port });
      toast({
        title: "Port Blocked",
        description: `Port ${port} has been successfully blocked.`,
      });
      fetchPorts();
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to block port",
        description: "An error occurred while trying to block the port.",
        variant: "destructive",
      });
    } finally {
      setProcessingPort(null);
    }
  };

  const unblockPort = async (port: number) => {
    try {
      setProcessingPort(port);
      await axios.post("/unblock_port", { port });
      toast({
        title: "Port Unblocked",
        description: `Port ${port} has been successfully unblocked.`,
      });
      fetchPorts();
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to unblock port",
        description: "An error occurred while trying to unblock the port.",
        variant: "destructive",
      });
    } finally {
      setProcessingPort(null);
    }
  };

  const filteredPorts = ports.filter(
    (port) =>
      port.port.toString().includes(searchTerm) ||
      port.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      port.protocol.toLowerCase().includes(searchTerm.toLowerCase())
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
          placeholder="Search ports, services, or protocols..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={fetchPorts} disabled={isLoading}>
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
      ) : filteredPorts.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No ports found.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPorts.map((port) => (
                <TableRow key={port.port}>
                  <TableCell className="font-mono">{port.port}</TableCell>
                  <TableCell>{port.service}</TableCell>
                  <TableCell>{port.protocol.toUpperCase()}</TableCell>
                  <TableCell>
                    {port.blocked ? (
                      <Badge variant="destructive">Blocked</Badge>
                    ) : (
                      <Badge variant="success">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {port.blocked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unblockPort(port.port)}
                        disabled={processingPort === port.port}
                      >
                        {processingPort === port.port ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Unlock className="mr-2 h-4 w-4" />
                        )}
                        Unblock
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => blockPort(port.port)}
                        disabled={processingPort === port.port}
                      >
                        {processingPort === port.port ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="mr-2 h-4 w-4" />
                        )}
                        Block
                      </Button>
                    )}
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

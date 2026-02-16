"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { BoxIcon, AttachmentIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, fetcher } from "@/lib/utils";

type SandboxEntry = {
  name: string;
  type: "file" | "dir";
  path: string;
  size: number;
  permissions: string;
  owner: string;
  group: string;
  modifiedTime?: string;
  symlinkTarget?: string | null;
};

type SandboxFilesResponse = {
  sandboxId: string;
  path: string;
  entries: SandboxEntry[];
};

type SandboxFileResponse = {
  sandboxId: string;
  path: string;
  content: string;
  truncated: boolean;
};

const buildFilesUrl = (
  chatId: string,
  sandboxId: string,
  path: string
) => {
  const params = new URLSearchParams({
    chatId,
    sandboxId,
    path,
    depth: "2",
  });
  return `/api/sandbox/files?${params.toString()}`;
};

const buildFileUrl = (
  chatId: string,
  sandboxId: string,
  path: string
) => {
  const params = new URLSearchParams({
    chatId,
    sandboxId,
    path,
    maxChars: "20000",
  });
  return `/api/sandbox/file?${params.toString()}`;
};

const normalizePath = (value: string) => {
  if (!value.trim()) {
    return "/";
  }
  const cleaned = value.replace(/\\/g, "/");
  if (!cleaned.startsWith("/")) {
    return `/${cleaned}`;
  }
  return cleaned;
};

const getParentPath = (path: string) => {
  if (path === "/" || !path) {
    return "/";
  }
  const parts = path.split("/").filter(Boolean);
  const parent = parts.slice(0, -1).join("/");
  return parent ? `/${parent}` : "/";
};

export function SandboxBrowser({
  chatId,
  sandboxId,
  open,
  onOpenChange,
}: {
  chatId: string;
  sandboxId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [path, setPath] = useState("/");
  const [activePath, setActivePath] = useState("/");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPath(activePath);
  }, [open, activePath]);

  const filesUrl = useMemo(() => {
    if (!open || !sandboxId) {
      return null;
    }
    return buildFilesUrl(chatId, sandboxId, activePath);
  }, [activePath, chatId, open, sandboxId]);

  const { data, error, isLoading, mutate } = useSWR<SandboxFilesResponse>(
    filesUrl,
    fetcher
  );

  const fileUrl = useMemo(() => {
    if (!open || !sandboxId || !selectedFile) {
      return null;
    }
    return buildFileUrl(chatId, sandboxId, selectedFile);
  }, [chatId, open, sandboxId, selectedFile]);

  const {
    data: fileData,
    error: fileError,
    isLoading: isFileLoading,
  } = useSWR<SandboxFileResponse>(fileUrl, fetcher);

  const entries = useMemo(() => {
    if (!data?.entries) {
      return [];
    }
    return [...data.entries].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "dir" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [data?.entries]);

  const filesErrorMessage =
    error instanceof Error ? error.message : "Failed to load files.";
  const fileErrorMessage =
    fileError instanceof Error
      ? fileError.message
      : "Failed to load file contents.";

  const handleGo = () => {
    const normalized = normalizePath(path);
    setActivePath(normalized);
    setSelectedFile(null);
  };

  const handleUp = () => {
    setActivePath(getParentPath(activePath));
    setSelectedFile(null);
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex h-full flex-col gap-4 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Sandbox Files</SheetTitle>
        </SheetHeader>

        {!sandboxId && (
          <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
            No sandbox is connected yet. Run a sandbox tool (Blueprint build,
            test, or command) to create a sandbox, then open this panel again.
          </div>
        )}

        {sandboxId && (
          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex items-center gap-2">
              <Button
                className="h-8 px-2"
                onClick={handleUp}
                size="sm"
                variant="outline"
              >
                Up
              </Button>
              <Input
                className="h-8"
                onChange={(event) => setPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleGo();
                  }
                }}
                value={path}
              />
              <Button
                className="h-8 px-3"
                onClick={handleGo}
                size="sm"
                variant="secondary"
              >
                Go
              </Button>
              <Button
                className="h-8 px-3"
                onClick={() => mutate()}
                size="sm"
                variant="ghost"
              >
                Refresh
              </Button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <ScrollArea className="rounded-md border">
                <div className="flex flex-col gap-1 p-2">
                  {isLoading && (
                    <div className="p-3 text-muted-foreground text-sm">
                      Loading files...
                    </div>
                  )}
                  {error && (
                    <div className="p-3 text-destructive text-sm">
                      {filesErrorMessage}
                    </div>
                  )}
                  {!isLoading && entries.length === 0 && (
                    <div className="p-3 text-muted-foreground text-sm">
                      No files found at {activePath}
                    </div>
                  )}
                  {entries.map((entry) => {
                    const isSelected = entry.path === selectedFile;
                    return (
                      <button
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                          isSelected && "bg-accent text-accent-foreground"
                        )}
                        key={entry.path}
                        onClick={() => {
                          if (entry.type === "dir") {
                            setActivePath(entry.path);
                            setPath(entry.path);
                            setSelectedFile(null);
                          } else {
                            setSelectedFile(entry.path);
                          }
                        }}
                        type="button"
                      >
                        {entry.type === "dir" ? (
                          <BoxIcon size={14} />
                        ) : (
                          <AttachmentIcon />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex min-h-0 flex-col rounded-md border">
                <div className="border-b px-3 py-2 text-muted-foreground text-sm">
                  {selectedFile ? selectedFile : "Select a file to preview"}
                </div>
                <ScrollArea className="min-h-0 flex-1 p-3">
                  {!selectedFile && (
                    <div className="text-muted-foreground text-sm">
                      Pick a file from the list to view its contents.
                    </div>
                  )}
                  {selectedFile && isFileLoading && (
                    <div className="text-muted-foreground text-sm">
                      Loading file...
                    </div>
                  )}
                  {fileError && (
                    <div className="text-destructive text-sm">
                      {fileErrorMessage}
                    </div>
                  )}
                  {fileData?.content && (
                    <pre className="whitespace-pre-wrap break-words text-xs">
                      {fileData.content}
                      {fileData.truncated && (
                        <span className="block pt-2 text-muted-foreground">
                          (truncated)
                        </span>
                      )}
                    </pre>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

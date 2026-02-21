"use client";

import { TonConnectButton } from "@tonconnect/ui-react";
import { useRouter } from "next/navigation";
import { memo } from "react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { BoxIcon, PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  onOpenSandbox,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onOpenSandbox?: () => void;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="flex w-full items-center gap-3 px-3 py-2">
        <div className="flex items-center gap-2">
          <SidebarToggle />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {(!open || windowWidth < 768) && (
            <Button
              className="h-8 px-2"
              onClick={() => {
                router.push("/");
                router.refresh();
              }}
              variant="outline"
            >
              <PlusIcon />
              <span className="md:sr-only">New Chat</span>
            </Button>
          )}

          {!isReadonly && (
            <VisibilitySelector
              chatId={chatId}
              selectedVisibilityType={selectedVisibilityType}
            />
          )}

          {!isReadonly && onOpenSandbox && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 px-2"
                  onClick={onOpenSandbox}
                  variant="outline"
                >
                  <BoxIcon size={16} />
                  <span className="md:sr-only">Sandbox Files</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sandbox files</TooltipContent>
            </Tooltip>
          )}

          <div className="flex items-center [&_button]:h-8 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm">
            <TonConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});

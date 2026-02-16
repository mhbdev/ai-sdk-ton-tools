import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import type { ToolOptions } from "../types";

export const createDnsTools = ({ client }: ToolOptions) => ({
  tonResolveDns: jsonSafeTool({
    description: "Resolve a .ton or .t.me DNS name to its record.",
    inputSchema: z.object({
      domain: z
        .string()
        .min(1)
        .describe("Domain name such as alice.ton or bot.t.me."),
    }),
    execute: async ({ domain }) => client.dns.dnsResolve(domain),
  }),
  tonGetDnsInfo: jsonSafeTool({
    description: "Get detailed DNS info for a TON domain.",
    inputSchema: z.object({
      domain: z
        .string()
        .min(1)
        .describe("Domain name such as alice.ton or bot.t.me."),
    }),
    execute: async ({ domain }) => client.dns.getDnsInfo(domain),
  }),
  tonGetDnsBids: jsonSafeTool({
    description: "Get bids for a TON DNS domain.",
    inputSchema: z.object({
      domain: z
        .string()
        .min(1)
        .describe("Domain name such as alice.ton or bot.t.me."),
    }),
    execute: async ({ domain }) => client.dns.getDomainBids(domain),
  }),
  tonGetDnsAuctions: jsonSafeTool({
    description: "Get current DNS auctions.",
    inputSchema: z.object({
      tld: z
        .string()
        .optional()
        .describe('Top-level domain filter: "ton" or "t.me".'),
    }),
    execute: async ({ tld }) => client.dns.getAllAuctions({ tld }),
  }),
});

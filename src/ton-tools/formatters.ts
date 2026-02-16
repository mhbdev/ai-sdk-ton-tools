import {
  type Address,
  type Cell,
  type CommonMessageInfo,
  type CommonMessageInfoRelaxed,
  type CurrencyCollection,
  type ExternalAddress,
  type Message,
  type MessageRelaxed,
  type StateInit,
  type Transaction,
  type TransactionDescription,
} from "@ton/core";

export const formatAddress = (address?: Address | null) =>
  address ? address.toString() : null;

export const formatExternalAddress = (address?: ExternalAddress | null) =>
  address ? address.toString() : null;

export const formatCurrencyCollection = (value: CurrencyCollection) => {
  const other =
    value.other && value.other.size > 0
      ? [...value.other].map(([id, amount]) => ({
          id,
          amount: amount.toString(),
        }))
      : undefined;

  return {
    coins: value.coins.toString(),
    other,
  };
};

export const formatCellSummary = (cell: Cell, includeBoc = false) => ({
  hash: cell.hash().toString("hex"),
  bits: cell.bits.length,
  refs: cell.refs.length,
  isExotic: cell.isExotic,
  ...(includeBoc ? { boc: cell.toBoc().toString("base64") } : {}),
});

export const formatStateInit = (
  init?: StateInit | null,
  options?: { includeCodeBoc?: boolean; includeDataBoc?: boolean }
) => {
  if (!init) {
    return null;
  }

  return {
    splitDepth: init.splitDepth ?? null,
    special: init.special ?? null,
    code: init.code
      ? formatCellSummary(init.code, options?.includeCodeBoc)
      : null,
    data: init.data
      ? formatCellSummary(init.data, options?.includeDataBoc)
      : null,
    librariesCount: init.libraries ? init.libraries.size : 0,
  };
};

export const formatMessageInfo = (info: CommonMessageInfo) => {
  if (info.type === "internal") {
    return {
      type: info.type,
      ihrDisabled: info.ihrDisabled,
      bounce: info.bounce,
      bounced: info.bounced,
      src: formatAddress(info.src),
      dest: formatAddress(info.dest),
      value: formatCurrencyCollection(info.value),
      ihrFee: info.ihrFee.toString(),
      forwardFee: info.forwardFee.toString(),
      createdLt: info.createdLt.toString(),
      createdAt: info.createdAt,
    };
  }

  if (info.type === "external-in") {
    return {
      type: info.type,
      src: formatExternalAddress(info.src ?? null),
      dest: formatAddress(info.dest),
      importFee: info.importFee.toString(),
    };
  }

  return {
    type: info.type,
    src: formatAddress(info.src),
    dest: formatExternalAddress(info.dest ?? null),
    createdLt: info.createdLt.toString(),
    createdAt: info.createdAt,
  };
};

export const formatMessageInfoRelaxed = (info: CommonMessageInfoRelaxed) => {
  if (info.type === "internal") {
    return {
      type: info.type,
      ihrDisabled: info.ihrDisabled,
      bounce: info.bounce,
      bounced: info.bounced,
      src: formatAddress(info.src ?? null),
      dest: formatAddress(info.dest),
      value: formatCurrencyCollection(info.value),
      ihrFee: info.ihrFee.toString(),
      forwardFee: info.forwardFee.toString(),
      createdLt: info.createdLt.toString(),
      createdAt: info.createdAt,
    };
  }

  return {
    type: info.type,
    src: formatAddress(info.src ?? null),
    dest: formatExternalAddress(info.dest ?? null),
    createdLt: info.createdLt.toString(),
    createdAt: info.createdAt,
  };
};

export const formatMessage = (
  message: Message,
  options?: { includeBodyBoc?: boolean; includeInitBoc?: boolean }
) => ({
  info: formatMessageInfo(message.info),
  init: formatStateInit(message.init ?? null, {
    includeCodeBoc: options?.includeInitBoc,
    includeDataBoc: options?.includeInitBoc,
  }),
  body: formatCellSummary(message.body, options?.includeBodyBoc),
});

export const formatMessageRelaxed = (
  message: MessageRelaxed,
  options?: { includeBodyBoc?: boolean; includeInitBoc?: boolean }
) => ({
  info: formatMessageInfoRelaxed(message.info),
  init: formatStateInit(message.init ?? null, {
    includeCodeBoc: options?.includeInitBoc,
    includeDataBoc: options?.includeInitBoc,
  }),
  body: formatCellSummary(message.body, options?.includeBodyBoc),
});

export const formatTransactionDescription = (
  description: TransactionDescription
) => {
  switch (description.type) {
    case "generic":
      return {
        type: description.type,
        aborted: description.aborted,
        destroyed: description.destroyed,
      };
    case "tick-tock":
      return {
        type: description.type,
        isTock: description.isTock,
        aborted: description.aborted,
        destroyed: description.destroyed,
      };
    case "split-install":
      return {
        type: description.type,
        installed: description.installed,
      };
    case "merge-prepare":
      return {
        type: description.type,
        aborted: description.aborted,
      };
    case "merge-install":
      return {
        type: description.type,
        aborted: description.aborted,
        destroyed: description.destroyed,
      };
    default:
      return { type: description.type };
  }
};

export const formatTransaction = (
  transaction: Transaction,
  options?: {
    includeMessages?: boolean;
    includeBodyBoc?: boolean;
    includeInitBoc?: boolean;
  }
) => {
  const outMessages =
    options?.includeMessages === false
      ? undefined
      : [...transaction.outMessages].map(([key, message]) => ({
          key,
          message: formatMessage(message, {
            includeBodyBoc: options?.includeBodyBoc,
            includeInitBoc: options?.includeInitBoc,
          }),
        }));

  return {
    address: transaction.address.toString(16).padStart(64, "0"),
    lt: transaction.lt.toString(),
    prevTransactionHash: transaction.prevTransactionHash
      .toString(16)
      .padStart(64, "0"),
    prevTransactionLt: transaction.prevTransactionLt.toString(),
    now: transaction.now,
    outMessagesCount: transaction.outMessagesCount,
    oldStatus: transaction.oldStatus,
    endStatus: transaction.endStatus,
    inMessage: transaction.inMessage
      ? formatMessage(transaction.inMessage, {
          includeBodyBoc: options?.includeBodyBoc,
          includeInitBoc: options?.includeInitBoc,
        })
      : null,
    outMessages,
    totalFees: formatCurrencyCollection(transaction.totalFees),
    description: formatTransactionDescription(transaction.description),
    hash: transaction.hash().toString("hex"),
  };
};

import { formatAmount, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { transactionCategoryStyles } from "@/constants";
import {
  Smartphone,
  CreditCard,
  Building2,
  Wallet,
  Globe,
  Store,
} from "lucide-react";

const channelBadgeStyles: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  UPI: {
    bg: "bg-purple-900/30",
    text: "text-purple-400",
    icon: <Smartphone size={12} />,
  },
  Card: {
    bg: "bg-orange-900/30",
    text: "text-orange-400",
    icon: <CreditCard size={12} />,
  },
  Netbanking: {
    bg: "bg-blue-900/30",
    text: "text-blue-400",
    icon: <Building2 size={12} />,
  },
  Wallet: {
    bg: "bg-teal-900/30",
    text: "text-teal-400",
    icon: <Wallet size={12} />,
  },
  online: {
    bg: "bg-slate-800",
    text: "text-slate-400",
    icon: <Globe size={12} />,
  },
  "in store": {
    bg: "bg-yellow-900/30",
    text: "text-yellow-400",
    icon: <Store size={12} />,
  },
};

const TransactionsTable = ({
  transactions,
}: {
  transactions: Transaction[];
}) => {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="text-16 text-slate-400">No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-4 py-3 text-left text-12 font-medium text-slate-400">
              Transaction
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-slate-400">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-slate-400">
              Status
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-slate-400">
              Date
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-slate-400">
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isDebit = tx.type === "debit" || tx.amount < 0;
            const categoryStyle =
              transactionCategoryStyles[
                tx.category as keyof typeof transactionCategoryStyles
              ] || transactionCategoryStyles.default;
            const channelStyle =
              channelBadgeStyles[tx.paymentChannel] ||
              channelBadgeStyles.online;

            return (
              <tr
                key={tx.id}
                className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <p className="text-14 font-semibold text-slate-200">
                      {tx.name}
                    </p>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-11 font-medium w-fit",
                        channelStyle.bg,
                        channelStyle.text,
                      )}
                    >
                      {channelStyle.icon}
                      {tx.paymentChannel}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p
                    className={cn("text-14 font-semibold", {
                      "text-red-400": isDebit,
                      "text-emerald-400": !isDebit,
                    })}
                  >
                    {isDebit ? "-" : "+"}
                    {formatAmount(Math.abs(tx.amount))}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-1 text-12 font-medium",
                      {
                        "bg-yellow-900/30 text-yellow-400": tx.pending,
                        "bg-green-900/30 text-green-400": !tx.pending,
                      },
                    )}
                  >
                    {tx.pending ? "Pending" : "Completed"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-14 text-slate-400">
                    {formatDateTime(new Date(tx.date)).dateOnly}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-12 font-medium",
                      categoryStyle.borderColor,
                      categoryStyle.backgroundColor,
                    )}
                  >
                    <span className={categoryStyle.textColor}>
                      {tx.category}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionsTable;

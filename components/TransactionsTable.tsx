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
    bg: "bg-purple-100",
    text: "text-purple-700",
    icon: <Smartphone size={12} />,
  },
  Card: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    icon: <CreditCard size={12} />,
  },
  Netbanking: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    icon: <Building2 size={12} />,
  },
  Wallet: {
    bg: "bg-teal-100",
    text: "text-teal-700",
    icon: <Wallet size={12} />,
  },
  online: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    icon: <Globe size={12} />,
  },
  "in store": {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
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
        <p className="text-16 text-gray-500">No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">
              Transaction
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">
              Date
            </th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">
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
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <p className="text-14 font-semibold text-gray-900">
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
                      "text-red-600": isDebit,
                      "text-green-600": !isDebit,
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
                        "bg-yellow-100 text-yellow-800": tx.pending,
                        "bg-green-100 text-green-800": !tx.pending,
                      },
                    )}
                  >
                    {tx.pending ? "Pending" : "Completed"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-14 text-gray-600">
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

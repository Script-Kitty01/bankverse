import { formatAmount, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { transactionCategoryStyles } from "@/constants";

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
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">Transaction</th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">Amount</th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">Date</th>
            <th className="px-4 py-3 text-left text-12 font-medium text-gray-500">Category</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isDebit = tx.type === "debit" || tx.amount < 0;
            const categoryStyle = transactionCategoryStyles[tx.category as keyof typeof transactionCategoryStyles] || transactionCategoryStyles.default;

            return (
              <tr
                key={tx.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <p className="text-14 font-semibold text-gray-900">{tx.name}</p>
                    <p className="text-12 text-gray-500">{tx.paymentChannel}</p>
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
                      }
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
                      categoryStyle.backgroundColor
                    )}
                  >
                    <span className={categoryStyle.textColor}>{tx.category}</span>
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

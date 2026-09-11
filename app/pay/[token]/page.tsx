import { PaymentPage } from "@/components/billing/PaymentPage";

export const metadata = { title: "Secure invoice payment", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  return <PaymentPage token={(await params).token} />;
}

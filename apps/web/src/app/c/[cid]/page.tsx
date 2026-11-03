import { redirect } from "next/navigation";

export default async function CompanyIndex({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  redirect(`/c/${cid}/overview`);
}

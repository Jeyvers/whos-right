import { redirect } from "next/navigation";

/** The jury lives on the judging page now; keep old links (and ?join=1) working. */
export default async function JuryPage(props: PageProps<"/jury">) {
  const sp = await props.searchParams;
  redirect(sp.join === "1" ? "/cases?join=1" : "/cases");
}

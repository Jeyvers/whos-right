import { ContractStatus } from "@/components/ContractStatus";
import { LoginButton } from "@/components/LoginButton";
import { network } from "@/lib/network";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Who&apos;s Right?</h1>
        <p className="text-zinc-700">
          Two people disagree. Each pays the same small fee, and a jury of randomly chosen, verified real people
          decides who&apos;s right. The jurors who vote on time share the fees. If no verdict is reached, you both get
          your money back.
        </p>
        <LoginButton />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Right now on {network.label}</h2>
        <ContractStatus />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="list-decimal pl-5 text-zinc-700 flex flex-col gap-1">
          <li>Write your side and pick Standard or Fast.</li>
          <li>Send the private invite link to the other person. They write their side and pay the same fee.</li>
          <li>A jury of 5 verified people is drawn at random and votes in secret.</li>
          <li>The verdict is revealed. Jurors who voted share the fees.</li>
        </ol>
      </section>
    </div>
  );
}

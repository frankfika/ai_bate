import Link from "next/link";

export default async function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          AI <span className="text-[hsl(280,100%,70%)]">辩论场</span>
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
          <Link
            className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
            href="/debate"
          >
            <h3 className="text-2xl font-bold">开始辩论 →</h3>
            <div className="text-lg">
              开始一场精彩的AI辩论，让两个AI辩手就特定话题展开激烈讨论。
            </div>
          </Link>
          <Link
            className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
            href="/history"
          >
            <h3 className="text-2xl font-bold">历史辩论 →</h3>
            <div className="text-lg">
              查看历史辩论记录，回顾精彩的辩论瞬间。
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}

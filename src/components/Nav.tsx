import Link from "next/link";

const LINKS = [
  ["/curriculums", "Library"],
  ["/", "Dashboard"], ["/review", "Review"], ["/flashcards", "Flashcards"],
  ["/lessons", "Lessons"], ["/vocab", "Vocab"], ["/progress", "Progress"],
  ["/curriculums/import", "Import"], ["/prompts", "Prompts"],
  ["/settings", "Settings"],
] as const;

export function Nav({ showSetupGuide = false }: { showSetupGuide?: boolean }) {
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b p-4 text-sm">
      {showSetupGuide && (
        <Link href="/welcome" className="font-semibold hover:underline">
          Setup guide
        </Link>
      )}
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="hover:underline">{label}</Link>
      ))}
      <form action="/auth/signout" method="post" className="ml-auto">
        <button className="text-gray-500 hover:underline">Sign out</button>
      </form>
    </nav>
  );
}

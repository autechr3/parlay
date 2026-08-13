import Link from "next/link";
import { ImportForm } from "@/components/ImportForm";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Import content</h1>
      <p className="mb-6 text-sm text-gray-600">
        Paste a content-package JSON produced by your AI agent. Need one? Grab a
        generator prompt from <Link href="/prompts" className="underline">Prompts</Link>.
      </p>
      <ImportForm />
    </main>
  );
}

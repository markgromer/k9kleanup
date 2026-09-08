import Link from 'next/link';
import { ArrowLeft, Dog, ExternalLink, LogOut } from 'lucide-react';
import { AdminPanel } from '@/components/admin-panel';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { getRecentQuotes, getSiteSettings } from '@/db/site-data';
import { isAuthorizedAdminEmail } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireChatGPTUser('/admin');
  if (!isAuthorizedAdminEmail(user.email)) {
    return (
      <main className="grid min-h-screen place-items-center bg-secondary p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <Dog className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 font-heading text-3xl font-black">This account isn&apos;t an owner.</h1>
          <p className="mt-3 text-muted-foreground">You&apos;re signed in as {user.email}. Ask the site owner to add this address.</p>
          <div className="mt-6 flex justify-center gap-3"><Link className={buttonVariants({ variant: 'outline' })} href="/">View site</Link><a className={buttonVariants()} href={chatGPTSignOutPath('/admin')} target="_top">Switch account</a></div>
        </div>
      </main>
    );
  }

  const [settings, quotes] = await Promise.all([getSiteSettings(), getRecentQuotes()]);
  const frequencyLabels: Record<string, string> = { weekly: 'Weekly', biweekly: 'Every other week', onetime: 'One-time', unsure: 'Not sure' };

  return (
    <main className="min-h-screen bg-[#f5f7f4] pb-20">
      <header className="border-b bg-card">
        <div className="site-container flex min-h-20 items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-accent"><Dog className="size-5" /></span><div><p className="font-heading text-xl font-black">K9 Kleanup</p><p className="text-xs text-muted-foreground">Owner dashboard</p></div></div>
          <div className="flex items-center gap-2"><Link className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'gap-1')} href="/"><ArrowLeft className="size-4" /> View site</Link><a className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'gap-1')} href={chatGPTSignOutPath('/')} target="_top"><LogOut className="size-4" /> Sign out</a></div>
        </div>
      </header>

      <div className="site-container py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="eyebrow">Site control center</p><h1 className="font-heading text-4xl font-black sm:text-5xl">Welcome back, {user.fullName?.split(' ')[0] || 'owner'}.</h1><p className="mt-2 text-muted-foreground">Update the public site and follow up with new quote requests.</p></div>
          <Link className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')} href="/" target="_blank">Open public site <ExternalLink className="size-4" /></Link>
        </div>

        <AdminPanel settings={settings} />

        <section className="mt-10 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-5"><div><h2 className="font-heading text-2xl font-black">Quote requests</h2><p className="text-sm text-muted-foreground">{quotes.length ? `${quotes.length} most recent inquiries` : 'New requests will appear here.'}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{quotes.filter((q) => q.status === 'new').length} new</span></div>
          {quotes.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>ZIP</TableHead><TableHead>Dogs</TableHead><TableHead>Service</TableHead><TableHead>Contact</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
                <TableBody>{quotes.map((quote) => <TableRow key={quote.id}><TableCell><p className="font-semibold">{quote.name}</p>{quote.notes && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{quote.notes}</p>}</TableCell><TableCell>{quote.zip}</TableCell><TableCell>{quote.dogs}</TableCell><TableCell>{frequencyLabels[quote.frequency] || quote.frequency}</TableCell><TableCell><a className="block font-medium text-primary hover:underline" href={`tel:${quote.phone}`}>{quote.phone}</a><a className="text-xs text-muted-foreground hover:underline" href={`mailto:${quote.email}`}>{quote.email}</a></TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{new Date(quote.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          ) : <div className="px-6 py-12 text-center text-muted-foreground">No quote requests yet.</div>}
        </section>
      </div>
    </main>
  );
}

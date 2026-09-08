'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageUp, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SiteSettings } from '@/db/site-data';

export function AdminPanel({ settings }: { settings: SiteSettings }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  async function saveSettings(formData: FormData) {
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    setSaving(false);
    setMessage(response.ok ? 'Contact details saved.' : 'Could not save changes.');
    if (response.ok) window.setTimeout(() => window.location.reload(), 700);
  }

  async function uploadImage(formData: FormData) {
    setUploading(true);
    setMessage('');
    const response = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    const result = await response.json() as { error?: string };
    setUploading(false);
    setMessage(response.ok ? 'New hero photo uploaded.' : (result.error || 'Could not upload image.'));
    if (response.ok) window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={uploadImage} className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><ImageUp className="size-5" /></span><div><h2 className="font-heading text-xl font-black">Homepage photo</h2><p className="text-sm text-muted-foreground">Replace the large photo visitors see first.</p></div></div>
        <Image src={settings.heroImageKey ? `/media/${encodeURIComponent(settings.heroImageKey)}` : '/images/dog-banner.jpg'} alt="Current homepage" width={900} height={450} unoptimized={Boolean(settings.heroImageKey)} className="mt-5 aspect-[16/8] w-full rounded-xl object-cover" />
        <div className="mt-5 space-y-2"><Label htmlFor="file">Upload a new photo</Label><Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="h-11 cursor-pointer pt-2" /><p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 8 MB. Wide landscape photos work best.</p></div>
        <Button disabled={uploading} type="submit" className="mt-5 w-full"><>{uploading ? <Loader2 className="animate-spin" /> : <ImageUp />}{uploading ? 'Uploading…' : 'Upload and publish photo'}</></Button>
      </form>

      <form action={saveSettings} className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Save className="size-5" /></span><div><h2 className="font-heading text-xl font-black">Contact details</h2><p className="text-sm text-muted-foreground">These appear in the header and footer.</p></div></div>
        <div className="mt-6 space-y-2"><Label htmlFor="phone">Business phone</Label><Input id="phone" name="phone" defaultValue={settings.phone} required /></div>
        <div className="mt-5 space-y-2"><Label htmlFor="email">Business email</Label><Input id="email" name="email" type="email" defaultValue={settings.email} required /></div>
        <Button disabled={saving} type="submit" className="mt-6 w-full"><>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? 'Saving…' : 'Save contact details'}</></Button>
      </form>
      {message && <p className="lg:col-span-2 rounded-xl border bg-secondary px-4 py-3 text-sm font-semibold text-primary">{message}</p>}
    </div>
  );
}

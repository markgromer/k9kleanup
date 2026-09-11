"use client";

import { default as styles } from "../AdminPortal.module.css";
import { MediaAsset } from "./model";
import { Empty, Field, WorkspaceProps, formatBytes } from "./ui";
import { FormEvent, useState } from "react";

export function MediaLibrary({ payload, request, reload, run }: WorkspaceProps) {
  const assets = (payload.assets ?? []) as MediaAsset[];
  const configured = Boolean(payload.configured);
  const [selected, setSelected] = useState<File | null>(null);
  const [folder, setFolder] = useState("general");
  const [tags, setTags] = useState("");
  const [altText, setAltText] = useState("");
  async function upload(event: FormEvent) { event.preventDefault(); if (!selected) return; await run(async () => { const form = new FormData(); form.set("file", selected); form.set("folder", folder); form.set("tags", tags); form.set("altText", altText); await request("/api/admin/media", { method: "POST", body: form }); setSelected(null); setTags(""); setAltText(""); await reload(); }, "Media uploaded."); }
  return <>
    <form className={styles.uploadBar} onSubmit={(event) => void upload(event)}>
      <Field label="File"><input type="file" accept="image/*,video/mp4,video/webm,application/pdf" onChange={(event) => setSelected(event.target.files?.[0] ?? null)} required /></Field>
      <Field label="Folder"><input value={folder} onChange={(event) => setFolder(event.target.value)} /></Field>
      <Field label="Tags"><input value={tags} onChange={(event) => setTags(event.target.value)} /></Field>
      <Field label="Alt text"><input value={altText} onChange={(event) => setAltText(event.target.value)} /></Field>
      <button className={styles.primaryButton} disabled={!configured || !selected}>Upload</button>
    </form>
    {!configured ? <div className={styles.warning}><strong>Media storage is not connected.</strong><br />Ask your web team to run <code>reggie connect --deploy</code> for this site. That provisions the private media bucket and admin database. You can also connect a shared Google Drive folder under <a href="/admin/integrations#google-drive">Integrations</a>, then download a file from Drive and upload it here.</div> : null}
    <section className={styles.mediaGrid}>{assets.map((asset) => <article className={styles.mediaItem} key={asset.id}>
      <div className={styles.mediaPreview}>{asset.contentType.startsWith("image/") ? <>
        {/* R2 URLs are user-generated at runtime and cannot be predeclared for next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.altText || asset.fileName} />
      </> : <span>{asset.contentType.split("/")[1]?.toUpperCase()}</span>}</div>
      <div className={styles.mediaMeta}><strong title={asset.fileName}>{asset.fileName}</strong><span>{asset.folder} | {formatBytes(asset.size)}</span><div className={styles.tagList}>{asset.tags.map((tag) => <small key={tag}>{tag}</small>)}</div><div className={styles.rowActions}><a href={asset.url} target="_blank" rel="noreferrer">Open</a><button onClick={() => void run(async () => { await request("/api/admin/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: asset.id }) }); await reload(); }, "Media removed.")}>Remove</button></div></div>
    </article>)}{!assets.length ? <Empty>No media uploaded.</Empty> : null}</section>
  </>;
}

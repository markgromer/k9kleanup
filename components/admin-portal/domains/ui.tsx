"use client";

import { default as styles } from "../AdminPortal.module.css";
import { JsonRecord } from "./model";
import { ReactNode } from "react";

export type ApiRequest = (path: string, init?: RequestInit, token?: string) => Promise<JsonRecord>;

export type RunAction = (action: () => Promise<void>, success: string) => Promise<void>;

export type WorkspaceProps = { payload: JsonRecord; request: ApiRequest; reload: () => Promise<void>; run: RunAction };

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }

export function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" step="0.01" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /></Field>; }

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className={styles.toggle}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>; }

export function Stat({ label, value }: { label: string; value: string | number }) { return <div className={styles.stat}><span>{label}</span><strong>{value}</strong></div>; }

export function Empty({ children }: { children: ReactNode }) { return <p className={styles.empty}>{children}</p>; }

export function SimpleRows({ rows, empty }: { rows: Array<Array<string | number>>; empty: string }) { return rows.length ? <div className={styles.simpleRows}>{rows.map((row, index) => <div key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</div> : <Empty>{empty}</Empty>; }

export function formatDate(value?: string) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleDateString(); }

export function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }

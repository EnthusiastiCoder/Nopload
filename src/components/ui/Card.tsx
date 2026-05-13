import type { ComponentChildren } from 'preact';

export function Card({
  children,
  class: cls = '',
  as: Tag = 'div',
}: {
  children?: ComponentChildren;
  class?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag class={`rounded-lg border border-line bg-surface p-5 shadow-soft ${cls}`}>{children}</Tag>;
}

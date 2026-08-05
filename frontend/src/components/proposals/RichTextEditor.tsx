"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";

// Toolbar/marks are kept to the subset backend/sales/proposal_docx.py's
// HTML->docx converter understands (p, strong/em/u, ul/ol/li, blockquote,
// h1-h3, br) — anything richer here would silently drop out of the Word
// export.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 110,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [3] } }), Underline],
    content: value || "",
    editorProps: {
      attributes: { class: "rte-content", style: `min-height: ${minHeight}px` },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, icon: string, label: string) => (
    <button
      type="button"
      className={`rte-btn${active ? " active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      <i className={`bi ${icon}`} />
    </button>
  );

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar">
        {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "bi-type-bold", "Bold")}
        {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "bi-type-italic", "Italic")}
        {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "bi-type-underline", "Underline")}
        {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "bi-type-strikethrough", "Strikethrough")}
        <span className="rte-sep" />
        {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "bi-type-h3", "Heading")}
        {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "bi-list-ul", "Bullet list")}
        {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "bi-list-ol", "Numbered list")}
        {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "bi-quote", "Quote")}
      </div>
      <EditorContent editor={editor} />
      {!value && placeholder && <div className="rte-placeholder">{placeholder}</div>}
    </div>
  );
}

import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript as js } from "@codemirror/lang-javascript";

export const simpleScrollbarTheme = EditorView.theme(
  {
    /* Force the scroller to show a thin, overlay scrollbar */
    ".cm-scroller": {
      scrollbarWidth: "thin" /* Firefox */,
      scrollbarColor: "rgba(0,0,0,0.3) transparent",
    },
    /* WebKit */
    ".cm-scroller::-webkit-scrollbar": {
      width: "8px",
      height: "8px",
    },
    ".cm-scroller::-webkit-scrollbar-track": {
      background: "transparent",
    },
    ".cm-scroller::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(0,0,0,0.3)",
      borderRadius: "4px",
    },
  },
  { dark: false },
);

export function makeEditor(containerId, langExt, onChange, initial = "") {
  const parent = document.getElementById(containerId);
  if (!parent) throw new Error(`No container #${containerId}`);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      extensions: [
        basicSetup,
        langExt,
        EditorView.updateListener.of((upd) => {
          if (upd.docChanged) onChange(upd, parent.id);
        }),
      ],
    }),
  });
}

// Factory exports for each pane (we’ll wire onChange in app.js)
export const htmlMode = html();
export const cssMode = css();
export const jsMode = js();

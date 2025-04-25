import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript as js } from "@codemirror/lang-javascript";

/**
 * Creates a CodeMirror 6 editor in the given container.
 * @param {string} containerId - ID of the parent div.
 * @param {Extension} languageExt - Language support extension.
 * @param {string} initialContent - Initial document text.
 */
function makeEditor(containerId, languageExt, initialContent = "") {
  const parent = document.getElementById(containerId);
  if (!parent) {
    console.error(`Container #${containerId} not found`);
    return;
  }
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        languageExt,
        // call the global renderPreview & scheduleSave
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (window.renderPreview) window.renderPreview();
            if (window.scheduleSave) window.scheduleSave();
          }
        }),
      ],
    }),
  });
}

// Export editors so app.js can import them
export const htmlEditor = makeEditor(
  "editor-html",
  html(),
  "<!-- HTML here -->",
);
export const cssEditor = makeEditor("editor-css", css(), "/* CSS here */");
export const jsEditor = makeEditor("editor-js", js(), "// JS here");

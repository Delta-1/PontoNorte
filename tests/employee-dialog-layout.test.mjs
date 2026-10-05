import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const responsiveRules = css.split("/* Fluxos de funcionário: modal e primeiro acesso responsivos */").at(-1);

test("o modal de funcionário nunca depende de translação vertical", () => {
  assert.match(responsiveRules, /top:max\(16px,calc\(50dvh - 430px\)\)!important/);
  assert.match(responsiveRules, /transform:translateX\(-50%\)!important/);
  assert.doesNotMatch(responsiveRules, /translate\(-50%,-50%\)/);
});

test("o modal ocupa a tela inteira em celulares", () => {
  assert.match(
    responsiveRules,
    /@media\(max-width:700px\)[\s\S]*?\.employee-dialog\{[^}]*inset:0!important[^}]*height:100dvh!important[^}]*transform:none!important/,
  );
});

test("apenas o corpo do formulário recebe rolagem", () => {
  assert.match(responsiveRules, /\.employee-dialog\{[^}]*overflow:hidden!important/);
  assert.match(responsiveRules, /\.employee-dialog-form\{[^}]*overflow:hidden!important/);
  assert.match(responsiveRules, /\.employee-dialog-scroll\{[^}]*overflow-y:auto!important/);
});

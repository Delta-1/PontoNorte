import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("offers the operational and monthly reports requested by HR", () => {
  for (const title of [
    "Ponto do dia",
    "Relatório geral",
    "Presenças",
    "Faltas e ausências",
    "Registros de ponto",
    "Horas extras e banco",
    "Banco de horas",
    "Ocorrências",
    "Espelho mensal individual",
  ]) {
    assert.match(page, new RegExp(`title:\"${title}\"`));
  }
});

test("monthly closing requires one employee and supports month selection", () => {
  assert.match(page, /\[\"employee_record\",\"monthly\"\]\.includes\(wizard\.kind\)/);
  assert.match(page, /wizard\.kind===\"monthly\"\?<label>Qual mês\?<Input type=\"month\"/);
  assert.match(page, /Espelho mensal individual/);
});

test("complete Excel package contains every management worksheet", () => {
  for (const sheet of [
    "Informações",
    "Resumo geral",
    "Controle diário",
    "Presenças",
    "Faltas",
    "Registros de ponto",
    "Horas extras",
    "Banco de horas",
    "Funcionários",
    "Ocorrências",
  ]) {
    assert.ok(
      page.includes(`sheet:\"${sheet}\"`) || page.includes(`tableSheet(\"${sheet}\"`),
      `missing worksheet: ${sheet}`,
    );
  }
});

test("daily control exposes all four expected point events", () => {
  for (const field of ["entry_at", "break_start_at", "break_end_at", "exit_at"]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(page, /Entrada.*Início intervalo.*Fim intervalo.*Saída/s);
});

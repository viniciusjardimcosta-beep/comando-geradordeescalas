// Prova isolada do seletor Radix usado nos motivos de Assunção e Dispensa.
// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MotivoTitularField } from "@/routes/app.nbi.nova";

// jsdom não implementa Pointer Capture; o Radix Select usa essa API para
// abrir e concluir a seleção pelo mesmo caminho de eventos do navegador.
Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});

function CampoControlado({ contexto }: { contexto: "afastamento" | "retorno" }) {
  const [valor, setValor] = useState("");
  const chave = contexto === "afastamento" ? "MOTIVO_TITULAR" : "MOTIVO_RETORNO";
  const testId = contexto === "afastamento" ? "assunto-a-motivo-afastamento" : "assunto-d-motivo-retorno";
  return (
    <>
      <MotivoTitularField
        chave={chave}
        testId={testId}
        label={contexto === "afastamento" ? "Motivo do afastamento do titular" : "Motivo do retorno do titular"}
        obrigatorio
        valor={valor}
        onChange={setValor}
        contexto={contexto}
      />
      <output data-testid={`${testId}-valor`}>{valor}</output>
    </>
  );
}

async function selecionar(testId: string, opcao: string) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId(`${testId}-trigger`));
  expect(await screen.findByTestId(`${testId}-options`)).toBeVisible();
  await user.click(await screen.findByTestId(`${testId}-option-${opcao}`));
  await waitFor(() => expect(screen.queryByTestId(`${testId}-options`)).not.toBeInTheDocument());
}

describe.each([
  ["MOTIVO_TITULAR", "afastamento", "assunto-a-motivo-afastamento"],
  ["MOTIVO_RETORNO", "retorno", "assunto-d-motivo-retorno"],
] as const)("seletor %s", (_campo, contexto, testId) => {
  it("abre, seleciona férias, fecha e permite trocar o valor", async () => {
    render(<CampoControlado contexto={contexto} />);

    await selecionar(testId, "ferias");
    expect(screen.getByTestId(`${testId}-valor`)).toHaveTextContent("férias regulamentares");
    expect(screen.getByTestId(`${testId}-trigger`)).toHaveTextContent("Férias regulamentares");

    await selecionar(testId, "curso");
    expect(screen.getByTestId(`${testId}-valor`)).toHaveTextContent("curso");
    expect(screen.getByTestId(`${testId}-trigger`)).toHaveTextContent("Curso");
  });
});
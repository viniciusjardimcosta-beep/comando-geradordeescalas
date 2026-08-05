// Bloco 10C — prova isolada do AssuntoPicker.
// Identidade dos itens é o código interno do motor, nunca o texto visível.
// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssuntoPicker, testIdDoAssunto, assuntoSelecionavel, type TemplatePickable } from "@/components/nbi/AssuntoPicker";
import { CODIGOS_HOMOLOGADOS } from "@/utils/nbi-categorias";

// jsdom não implementa ResizeObserver (usado pelo cmdk) nem Pointer Capture.
vi.hoisted(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;
  (globalThis as unknown as { window?: { ResizeObserver: unknown } }).window!.ResizeObserver = ResizeObserverMock;
});


Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});


// Espelho fiel de public.nbi_templates.
const TEMPLATES: TemplatePickable[] = [
  { codigo: "ferias", titulo: "Férias", titulo_documento: "FÉRIAS", disponivel: true },
  { codigo: "apresentacao", titulo: "Apresentação após férias", titulo_documento: "APRESENTAÇÃO", disponivel: true },
  { codigo: "licenca_paternidade", titulo: "Licença-paternidade", titulo_documento: "LICENÇA PATERNIDADE", disponivel: true },
  { codigo: "luto", titulo: "Luto", titulo_documento: "LUTO", disponivel: false },
  { codigo: "dispensa_recompensa", titulo: "Dispensa por recompensa", titulo_documento: "DISPENSA POR RECOMPENSA", disponivel: true },
  { codigo: "dispensa_recompensa_sem_apresentacao", titulo: "Dispensa por recompensa (sem apresentação)", titulo_documento: "DISPENSA POR RECOMPENSA", disponivel: false },
  { codigo: "assuncao_funcao", titulo: "Assunção de função", titulo_documento: "ASSUNÇÃO DE FUNÇÃO", disponivel: true },
  { codigo: "assuncao_cargo_vago", titulo: "Assunção de função de cargo vago", titulo_documento: "ASSUNÇÃO DE FUNÇÃO", disponivel: false },
  { codigo: "dispensa_funcao", titulo: "Dispensa de função", titulo_documento: "DISPENSA DE FUNÇÃO", disponivel: true },
  { codigo: "dispensa_cargo_vago", titulo: "Dispensa de função de cargo vago", titulo_documento: "DISPENSA DE FUNÇÃO", disponivel: false },
  { codigo: "viagem", titulo: "Viagem", titulo_documento: "VIAGEM", disponivel: true },
  { codigo: "servico_extraordinario", titulo: "Serviço extraordinário", titulo_documento: "SERVIÇO EXTRAORDINÁRIO", disponivel: true },
  { codigo: "nomeacao_comissao", titulo: "Nomeação de comissão", titulo_documento: "NOMEAÇÃO DE COMISSÃO", disponivel: true },
  { codigo: "renovacao_tempo", titulo: "Renovação de tempo de serviço", titulo_documento: "RENOVAÇÃO DE TEMPO DE SERVIÇO", disponivel: false },
  { codigo: "situacao_sanitaria", titulo: "Situação sanitária", titulo_documento: "SITUAÇÃO SANITÁRIA", disponivel: false },
  { codigo: "comunicado", titulo: "Comunicado", titulo_documento: "COMUNICADO", disponivel: false },
];

const HOMOLOGADOS = TEMPLATES.filter(assuntoSelecionavel).map((t) => t.codigo);
const BLOQUEADOS = TEMPLATES.filter((t) => !assuntoSelecionavel(t)).map((t) => t.codigo);

async function abrir() {
  const user = userEvent.setup();
  const onEscolher = vi.fn();
  render(<AssuntoPicker templates={TEMPLATES} onEscolher={onEscolher} />);
  await user.click(screen.getByTestId("adicionar-assunto"));
  await screen.findByTestId("assunto-picker-lista");
  return { user, onEscolher };
}

describe("AssuntoPicker — identidade estável pelo código do motor", () => {
  it("expõe todos os assuntos homologados como clicáveis", async () => {
    await abrir();
    for (const codigo of HOMOLOGADOS) {
      const item = screen.getByTestId(testIdDoAssunto(codigo));
      expect(item).toHaveAttribute("data-codigo", codigo);
      expect(item).toHaveAttribute("data-disponivel", "true");
      expect(item).toHaveAttribute("aria-disabled", "false");
    }
    expect(HOMOLOGADOS).toContain("viagem");
    expect([...CODIGOS_HOMOLOGADOS].every((c) => HOMOLOGADOS.includes(c) || !TEMPLATES.some((t) => t.codigo === c))).toBe(true);
  });

  it("Viagem é selecionável e dispara onEscolher('viagem')", async () => {
    const { user, onEscolher } = await abrir();
    const item = screen.getByTestId(testIdDoAssunto("viagem"));
    expect(item).toHaveAttribute("aria-disabled", "false");
    await user.click(item);
    expect(onEscolher).toHaveBeenCalledWith("viagem");
  });

  it("seleciona cada assunto homologado individualmente", async () => {
    for (const codigo of HOMOLOGADOS) {
      const user = userEvent.setup();
      const onEscolher = vi.fn();
      const { unmount } = render(<AssuntoPicker templates={TEMPLATES} onEscolher={onEscolher} />);
      await user.click(screen.getByTestId("adicionar-assunto"));
      await screen.findByTestId("assunto-picker-lista");
      await user.click(screen.getByTestId(testIdDoAssunto(codigo)));
      expect(onEscolher).toHaveBeenCalledWith(codigo);
      unmount();
    }
  });

  it("mantém os bloqueados realmente não clicáveis", async () => {
    const { user, onEscolher } = await abrir();
    for (const codigo of BLOQUEADOS) {
      const item = screen.getByTestId(testIdDoAssunto(codigo));
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAttribute("data-disponivel", "false");
      await user.click(item);
    }
    expect(onEscolher).not.toHaveBeenCalled();
  });

  it("busca com e sem acento não altera o estado de habilitação", async () => {
    const { user, onEscolher } = await abrir();
    await user.type(screen.getByPlaceholderText("Pesquisar assunto…"), "viagem");
    const viagem = screen.getByTestId(testIdDoAssunto("viagem"));
    expect(viagem).toHaveAttribute("aria-disabled", "false");
    await user.click(viagem);
    expect(onEscolher).toHaveBeenCalledWith("viagem");
  });

  it("pesquisa sem acento encontra assunto acentuado", async () => {
    const { user, onEscolher } = await abrir();
    await user.type(screen.getByPlaceholderText("Pesquisar assunto…"), "servico extraordinario");
    const item = screen.getByTestId(testIdDoAssunto("servico_extraordinario"));
    expect(item).toHaveAttribute("aria-disabled", "false");
    await user.click(item);
    expect(onEscolher).toHaveBeenCalledWith("servico_extraordinario");
  });

  it("fecha e reabre sem estado residual de busca", async () => {
    const { user } = await abrir();
    await user.type(screen.getByPlaceholderText("Pesquisar assunto…"), "ferias");
    await user.click(screen.getByTestId(testIdDoAssunto("ferias")));
    await waitFor(() => expect(screen.queryByTestId("assunto-picker-lista")).not.toBeInTheDocument());
    await user.click(screen.getByTestId("adicionar-assunto"));
    await screen.findByTestId("assunto-picker-lista");
    expect(screen.getByPlaceholderText("Pesquisar assunto…")).toHaveValue("");
    expect(screen.getByTestId(testIdDoAssunto("viagem"))).toBeInTheDocument();
  });
});

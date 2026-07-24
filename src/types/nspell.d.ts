declare module "nspell" {
  interface Spell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string, model?: string): Spell;
    remove(word: string): Spell;
    wordCharacters(): string | undefined;
    dictionary(dic: string | Uint8Array): Spell;
    personal(dic: string | Uint8Array): Spell;
  }
  interface Input {
    aff: string | Uint8Array;
    dic: string | Uint8Array;
  }
  function nspell(input: Input | Input["aff"], dic?: Input["dic"]): Spell;
  export default nspell;
}

declare module "dictionary-pt/index.aff?url" {
  const url: string;
  export default url;
}
declare module "dictionary-pt/index.dic?url" {
  const url: string;
  export default url;
}

// Recursive-descent parser for OpenQASM 2.0 with panic-mode error recovery,
// so several syntax errors can be reported in one run.

import type { Diagnostic, Span } from '../diagnostics';
import type { Arg, Barrier, Expr, GateCall, Program, QuantumOp, Stmt } from './ast';
import { lex, type Token } from './lexer';

class ParseError extends Error {}

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt']);

export interface ParseResult {
  program: Program;
  diagnostics: Diagnostic[];
  tokens: Token[];
}

export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = lex(source);
  const p = new Parser(tokens, diagnostics);
  const program = p.program();
  return { program, diagnostics, tokens };
}

function join(a: Span, b: Span): Span {
  if (a.line !== b.line) return a;
  return { line: a.line, col: a.col, length: b.col + b.length - a.col };
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[], private diagnostics: Diagnostic[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private is(text: string): boolean {
    const t = this.peek();
    return (t.kind === 'symbol' || t.kind === 'keyword') && t.text === text;
  }

  private error(message: string, span: Span, hint?: string): never {
    this.diagnostics.push({ severity: 'error', code: 'E0100', message, span, hint });
    throw new ParseError(message);
  }

  private expect(text: string, what?: string): Token {
    if (this.is(text)) return this.next();
    const t = this.peek();
    const found = t.kind === 'eof' ? 'end of file' : `'${t.text}'`;
    const hint = text === ';' ? 'every statement must end with a semicolon' : undefined;
    // Point at the end of the previous token when a semicolon is missing, like rustc does.
    const prev = this.tokens[this.pos - 1];
    const span = text === ';' && prev ? { line: prev.span.line, col: prev.span.col + prev.span.length, length: 1 } : t.span;
    // Phrase-level recovery: a missing ';' at the end of a line is reported, then assumed,
    // so the next statement still gets parsed and checked.
    if (text === ';' && prev && t.span.line > prev.span.line) {
      this.diagnostics.push({ severity: 'error', code: 'E0100', message: `expected ';', found ${found}`, span, hint });
      return { kind: 'symbol', text: ';', span };
    }
    return this.error(`expected ${what ?? `'${text}'`}, found ${found}`, span, hint);
  }

  private ident(what: string): Token {
    const t = this.peek();
    if (t.kind === 'ident' || (t.kind === 'keyword' && (t.text === 'U' || t.text === 'CX'))) return this.next();
    const found = t.kind === 'eof' ? 'end of file' : `'${t.text}'`;
    return this.error(`expected ${what}, found ${found}`, t.span);
  }

  private int(what: string): Token {
    const t = this.peek();
    if (t.kind === 'int') return this.next();
    return this.error(`expected ${what}, found '${t.text || 'end of file'}'`, t.span);
  }

  /** Skip to just after the next ';' or '}' so parsing can continue after an error. */
  private synchronize() {
    let depth = 0;
    while (this.peek().kind !== 'eof') {
      const t = this.next();
      if (t.text === '{') depth++;
      if (t.text === '}') {
        if (depth <= 1) return;
        depth--;
      }
      if (t.text === ';' && depth === 0) return;
    }
  }

  program(): Program {
    const stmts: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      try {
        stmts.push(this.statement());
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.synchronize();
      }
    }
    return { stmts };
  }

  private statement(): Stmt {
    const t = this.peek();
    if (t.kind === 'keyword') {
      switch (t.text) {
        case 'OPENQASM': {
          this.next();
          const v = this.peek();
          if (v.kind !== 'real' && v.kind !== 'int') this.error('expected version number after OPENQASM', v.span);
          this.next();
          const end = this.expect(';');
          return { kind: 'version', version: v.text, span: join(t.span, end.span) };
        }
        case 'include': {
          this.next();
          const f = this.peek();
          if (f.kind !== 'string') this.error('expected a file name string after include', f.span);
          this.next();
          const end = this.expect(';');
          return { kind: 'include', file: f.text, span: join(t.span, end.span) };
        }
        case 'qreg':
        case 'creg': {
          this.next();
          const name = this.ident('register name');
          this.expect('[');
          const size = this.int('register size');
          this.expect(']');
          const end = this.expect(';');
          return { kind: t.text as 'qreg' | 'creg', name: name.text, size: Number(size.text), span: join(t.span, end.span) };
        }
        case 'gate':
        case 'opaque':
          return this.gateDef();
        case 'if': {
          this.next();
          this.expect('(');
          const creg = this.ident('classical register name');
          this.expect('==');
          const value = this.int('integer value');
          this.expect(')');
          const body = this.quantumOp();
          return { kind: 'if', creg: creg.text, cregSpan: creg.span, value: Number(value.text), body, span: t.span };
        }
      }
    }
    return this.quantumOp();
  }

  private quantumOp(): QuantumOp {
    const t = this.peek();
    if (t.kind === 'keyword' && t.text === 'measure') {
      this.next();
      const q = this.arg();
      this.expect('->');
      const c = this.arg();
      const end = this.expect(';');
      return { kind: 'measure', q, c, span: join(t.span, end.span) };
    }
    if (t.kind === 'keyword' && t.text === 'reset') {
      this.next();
      const q = this.arg();
      const end = this.expect(';');
      return { kind: 'reset', q, span: join(t.span, end.span) };
    }
    if (t.kind === 'keyword' && t.text === 'barrier') return this.barrier();
    if (t.kind === 'ident' || (t.kind === 'keyword' && (t.text === 'U' || t.text === 'CX'))) return this.gateCall();
    const found = t.kind === 'eof' ? 'end of file' : `'${t.text}'`;
    return this.error(`expected a statement, found ${found}`, t.span);
  }

  private barrier(): Barrier {
    const t = this.next();
    const args = this.argList();
    const end = this.expect(';');
    return { kind: 'barrier', args, span: join(t.span, end.span) };
  }

  private gateCall(): GateCall {
    const name = this.next();
    let params: Expr[] = [];
    if (this.is('(')) {
      this.next();
      if (!this.is(')')) params = this.exprList();
      this.expect(')');
    }
    const args = this.argList();
    const end = this.expect(';');
    return { kind: 'call', name: name.text, nameSpan: name.span, params, args, span: join(name.span, end.span) };
  }

  private gateDef(): Stmt {
    const kw = this.next();
    const opaque = kw.text === 'opaque';
    const name = this.ident('gate name');
    const params: string[] = [];
    if (this.is('(')) {
      this.next();
      if (!this.is(')')) {
        params.push(this.ident('parameter name').text);
        while (this.is(',')) {
          this.next();
          params.push(this.ident('parameter name').text);
        }
      }
      this.expect(')');
    }
    const qargs = [this.ident('qubit argument').text];
    while (this.is(',')) {
      this.next();
      qargs.push(this.ident('qubit argument').text);
    }
    if (opaque) {
      const end = this.expect(';');
      return { kind: 'gatedef', name: name.text, params, qargs, body: [], span: join(kw.span, end.span), opaque };
    }
    this.expect('{');
    const body: (GateCall | Barrier)[] = [];
    while (!this.is('}')) {
      if (this.peek().kind === 'eof') this.error(`unterminated body of gate '${name.text}'`, name.span, "add a closing '}'");
      if (this.is('barrier')) body.push(this.barrier());
      else body.push(this.gateCall());
    }
    const end = this.next();
    return { kind: 'gatedef', name: name.text, params, qargs, body, span: join(kw.span, end.span), opaque };
  }

  private argList(): Arg[] {
    const args = [this.arg()];
    while (this.is(',')) {
      this.next();
      args.push(this.arg());
    }
    return args;
  }

  private arg(): Arg {
    const name = this.ident('register or qubit');
    if (this.is('[')) {
      this.next();
      const idx = this.int('index');
      const close = this.expect(']');
      return { reg: name.text, index: Number(idx.text), span: join(name.span, close.span) };
    }
    return { reg: name.text, span: name.span };
  }

  private exprList(): Expr[] {
    const list = [this.expr()];
    while (this.is(',')) {
      this.next();
      list.push(this.expr());
    }
    return list;
  }

  // expr := term (('+'|'-') term)*
  private expr(): Expr {
    let left = this.term();
    while (this.is('+') || this.is('-')) {
      const op = this.next().text as '+' | '-';
      const right = this.term();
      left = { kind: 'binary', op, left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  // term := factor (('*'|'/') factor)*
  private term(): Expr {
    let left = this.factor();
    while (this.is('*') || this.is('/')) {
      const op = this.next().text as '*' | '/';
      const right = this.factor();
      left = { kind: 'binary', op, left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  // factor := unary ('^' factor)?   (right-associative)
  private factor(): Expr {
    const base = this.unary();
    if (this.is('^')) {
      this.next();
      const exp = this.factor();
      return { kind: 'binary', op: '^', left: base, right: exp, span: join(base.span, exp.span) };
    }
    return base;
  }

  private unary(): Expr {
    if (this.is('-')) {
      const t = this.next();
      const arg = this.unary();
      return { kind: 'unary', op: '-', arg, span: join(t.span, arg.span) };
    }
    if (this.is('+')) {
      this.next();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.peek();
    if (t.kind === 'int' || t.kind === 'real') {
      this.next();
      return { kind: 'num', value: Number(t.text), span: t.span };
    }
    if (t.kind === 'keyword' && t.text === 'pi') {
      this.next();
      return { kind: 'pi', span: t.span };
    }
    if (t.kind === 'ident') {
      this.next();
      if (FUNCTIONS.has(t.text) && this.is('(')) {
        this.next();
        const arg = this.expr();
        const close = this.expect(')');
        return { kind: 'call', fn: t.text, arg, span: join(t.span, close.span) };
      }
      return { kind: 'id', name: t.text, span: t.span };
    }
    if (this.is('(')) {
      this.next();
      const e = this.expr();
      this.expect(')');
      return e;
    }
    const found = t.kind === 'eof' ? 'end of file' : `'${t.text}'`;
    return this.error(`expected an expression, found ${found}`, t.span);
  }
}

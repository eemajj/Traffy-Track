declare module "papaparse" {
  export type ParseError = {
    row: number;
    message: string;
  };

  export type ParseResult<T> = {
    data: T[];
    errors: ParseError[];
    meta: {
      fields?: string[];
    };
  };

  export type ParseConfig<T> = {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
  };

  export function parse<T>(input: string, config?: ParseConfig<T>): ParseResult<T>;

  const Papa: {
    parse: typeof parse;
  };

  export default Papa;
}

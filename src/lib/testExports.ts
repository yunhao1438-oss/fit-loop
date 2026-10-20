/**
 * 测试专用导出入口：只打包纯逻辑层（不引入 React / 浏览器 API），
 * 供 tests/ 下的 node:test 用例通过 esbuild 产物引用。
 */
export * from "./utils";
export * from "./types";
export * from "./nutrition";
export * from "./plan/engine";
export * from "./progression";
export * from "./weekly";
export * from "./session";
export * from "./demo";
export * from "./seed/exercises";
export * from "./seed/foods";
export * from "./seed/muscles";

export type Nivel = "info" | "aviso" | "error";

export type Registrar = (nivel: Nivel, mensaje: string, detalle?: Record<string, unknown>) => void;

export const registrarEnConsola: Registrar = (nivel, mensaje, detalle) => {
  const hora = new Date().toISOString();
  const extra = detalle ? ` ${JSON.stringify(detalle)}` : "";
  const linea = `${hora} [${nivel}] ${mensaje}${extra}`;
  if (nivel === "error") console.error(linea);
  else console.log(linea);
};

export const registrarNada: Registrar = () => {};

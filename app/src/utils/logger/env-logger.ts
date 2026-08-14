

export default function logEnvVariable(
  envObject: string | undefined,
  envObjectName: string,
): void {
  if (envObject === undefined) {
    console.error(
      `Возникла проблема с получение ${envObjectName} из переменной среды`,
    );
  } else {
    console.log(
      `получение ${envObjectName} из переменной среды прошло успешно`,
    );
  }
}

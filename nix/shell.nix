{
  mkShell,
  fluid-queue,
}:
mkShell {
  inputsFrom = [
    fluid-queue
  ];
}

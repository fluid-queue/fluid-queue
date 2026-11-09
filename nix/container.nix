{
  fluid-queue,
  dockerTools,
}:

dockerTools.buildLayeredImage {
  name = fluid-queue.pname;
  tag = fluid-queue.version;

  contents = [
    dockerTools.binSh
    dockerTools.caCertificates
    fluid-queue
  ];

  config = {
    Cmd = [ "fluid-queue" ];
    WorkingDir = "/home/node";
  };
}

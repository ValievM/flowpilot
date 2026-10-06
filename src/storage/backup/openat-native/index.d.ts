declare const nativeOpen: {
  openAt(
    directoryFd: number,
    name: string,
    flags: number,
    mode?: number,
  ): number;
};

export = nativeOpen;

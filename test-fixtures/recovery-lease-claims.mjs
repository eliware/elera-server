export const recoveryLeaseClaims = (epoch, winner, members) =>
  members.map((member) => ({
    member,
    epoch,
    winner,
    granted: true,
    authenticated: true,
  }));

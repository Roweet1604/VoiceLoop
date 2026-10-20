// Display formatting in the viewer's locale and time zone.

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export const formatDate = (value) => dateFormat.format(new Date(value));
export const formatTime = (value) => timeFormat.format(new Date(value));

import { Handler } from "server"

export const handler: Handler = (server, socket) => {
    const { uid } = socket.data
    socket.emit("uid", uid)
}
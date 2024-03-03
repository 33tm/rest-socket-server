import { Handler } from "server"

export const handler: Handler = async (server, socket, data) => {
    server.in(data as string).emit("callback", data)
    socket.disconnect()
}
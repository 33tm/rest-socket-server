import express, { Request, Response, json } from "express"
import { Namespace, Server, Socket } from "socket.io"

import { readdirSync, statSync } from "fs"
import { createServer } from "http"

import SchoologyAPI from "schoologyapi"
import { verify } from "jsonwebtoken"

export const schoology = new SchoologyAPI(
    process.env.SCHOOLOGY_KEY as string,
    process.env.SCHOOLOGY_SECRET as string
)

const rest = express()
const server = createServer(rest)
const socket = new Server(server)

export type Route = (req: Request, res: Response) => void
export type Handler = (server: Namespace, socket: Socket) => void
type Event = [string, Handler]

const importRoutes = (root: string) => {
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importRoutes(path)
        if (!file.endsWith(".ts")) return
        import(`./${path}`).then(route => {
            const endpoint = path
                .slice(8, -3)
                .replace(/\[([^[\]]+)\]/g, ":$1")
                .replace(/\/index$/g, "") || "/"
            Object.entries(route).forEach(([method, handler]) => {
                if (!(method.toLowerCase() in rest)) return
                rest[method.toLowerCase() as keyof typeof rest](endpoint, handler)
                console.log(`REST ${method} ${endpoint}`)
            })
        })
    })
}

rest.use(json())

importRoutes("src/rest")

const namespaces: [string, Event[]][] = []

const importEvents = async (root: string) => {
    const events: Event[] = []
    await Promise.all(readdirSync(root).map(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importEvents(path)
        if (!file.endsWith(".ts")) return
        import(`./${path}`).then(({ handler }) => {
            if (!handler) return
            events.push([file.slice(0, -3), handler])
        })
    }))
    if (events.length) {
        namespaces.push([root.slice(10) || "/", events])
        console.log(`Socket ${root.slice(10) || "/"} [${events.map(x => x[0]).join(", ")}]`)
    }
}

importEvents("src/socket").then(() => {
    namespaces.forEach(([namespace, events]) => {
        const ns = socket.of(namespace)
        ns.on("connection", connection => {
            events.forEach(([event, handler]) => {
                connection.on(event, data => {
                    handler(ns, connection)
                    console.log(typeof data)
                })
            })
        })
    })
})

socket.of("/app").use((socket, next) => {
    const { authorization: token } = socket.handshake.headers
    if (!token) next(Error())
    try {
        socket.data = verify(token!, process.env.JWT_SECRET as string)
        next()
    } catch {
        next(Error())
    }
})

server.listen(443)
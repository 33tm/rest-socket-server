import express, { Request, Response, json } from "express"
import { Server, Socket } from "socket.io"
import { readdirSync, statSync } from "fs"

const rest = express()

type Route = (req: Request, res: Response) => void

const importRoutes = (root: string) => {
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importRoutes(path)
        if (!file.endsWith(".ts")) return
        import(`./${path.slice(0, -3)}`).then(route => {
            const endpoint = path
                .slice(8, -3)
                .replace(/\[([^[\]]+)\]/g, ":$1")
                .replace(/\/index$/g, "") || "/"
            Object.entries(route).forEach(([method, handler]) => {
                if (!(method.toLowerCase() in rest)) return
                rest[method.toLowerCase() as keyof typeof rest](endpoint, handler)
                console.log(`${method} ${endpoint}`)
            })
        })
    })
}

importRoutes("src/rest")

rest.use(json())

rest.listen(443)

const socket = new Server()

type Handler = (server: Server, socket: Socket) => void

type Event = [string, Handler]

const namespaces: [string, Event[]][] = []

const importEvents = (root: string) => {
    const events: Event[] = []
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importEvents(path)
        if (!file.endsWith(".ts")) return
        import(`./${path.slice(0, -3)}`).then(({ handler }) => {
            if (!handler) return
            events.push([file.slice(0, -3), handler])
        })
    })
    namespaces.push([root.slice(10) || "/", events])
}

importEvents("src/socket")

console.log(namespaces)

export type { Route, Handler }
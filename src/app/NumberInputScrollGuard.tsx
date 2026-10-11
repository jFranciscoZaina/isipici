"use client"

import { useEffect } from "react"

export default function NumberInputScrollGuard() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
        // Remove focus before the browser steps the value; keep normal page/modal scrolling.
        target.blur()
      }
    }
    document.addEventListener("wheel", handleWheel, { capture: true, passive: true })
    return () => document.removeEventListener("wheel", handleWheel, true)
  }, [])

  return null
}

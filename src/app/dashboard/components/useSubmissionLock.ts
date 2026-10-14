"use client"
import {useRef} from "react"
export function useSubmissionLock(){
 return useRef({locked:false,acquire(){if(this.locked)return false;this.locked=true;return true},release(){this.locked=false}}).current
}

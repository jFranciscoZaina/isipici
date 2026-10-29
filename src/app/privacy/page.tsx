import type {Metadata} from "next"
import PrivacyContent from "./PrivacyContent"

export const metadata:Metadata={
 title:"Privacy Policy · ISIPICI",
 description:"How ISIPICI collects, uses and protects information belonging to users, businesses and managed clients.",
 alternates:{canonical:"/privacy"},
}

export default function PrivacyPage(){return <PrivacyContent/>}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, DollarSign, Menu, UserPlus } from "react-feather";
import Image from "next/image";
import dynamic from "next/dynamic";
const ClientCsvModal=dynamic(()=>import("./ClientCsvModal"));
const PlansModal = dynamic(() => import("./PlansModal"));
const TeamAccessModal = dynamic(() => import("./TeamAccessModal"));
import ConfirmDialog from "./ConfirmDialog";
import isipiciLogo from "../../isipici.svg";
import LanguageSwitch from "../../LanguageSwitch";
import {useI18n} from "../../I18nProvider";

interface TopBarProps {
  paymentReady?: boolean;
  onNewPayment: () => void;
  onNewClient: () => void;
  onClientsImported?:()=>void;
}

export default function TopBar({ onNewPayment, onNewClient, onClientsImported, paymentReady=true }: TopBarProps) {
  const {t}=useI18n();
  const [modern,setModern]=useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showBusinessMenu,setShowBusinessMenu]=useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showCsv,setShowCsv]=useState(false);
  const [showPlans,setShowPlans]=useState(false);
  const [showTeam,setShowTeam]=useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const businessMenuRef=useRef<HTMLDivElement|null>(null);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } catch (e) {
      console.error("Error al cerrar sesión", e);

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  useEffect(() => {
    const loadOwner = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setOwnerName(data.name);
          setModern(data.authKind==="user");
        } else {
          console.error("No se pudo cargar el owner logueado");
        }
      } catch (e) {
        console.error("Error cargando owner:", e);
      }
    };

    loadOwner();

    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(()=>{
    if(!showBusinessMenu)return;
    const onPointerDown=(event:PointerEvent)=>{
      if(!businessMenuRef.current?.contains(event.target as Node))setShowBusinessMenu(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape")setShowBusinessMenu(false);
    };
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return()=>{
      document.removeEventListener("pointerdown",onPointerDown);
      document.removeEventListener("keydown",onKeyDown);
    };
  },[showBusinessMenu]);

  const openPlans=()=>{
    setShowBusinessMenu(false);
    setShowSheet(false);
    setShowPlans(true);
  };

  const openCsv=()=>{
    setShowBusinessMenu(false);
    setShowSheet(false);
    setShowCsv(true);
  };

  const openTeam=()=>{
    setShowBusinessMenu(false);
    setShowSheet(false);
    setShowTeam(true);
  };

  const askLogout=()=>{
    setShowBusinessMenu(false);
    setShowSheet(false);
    setConfirmLogout(true);
  };

  return (
    <>
      <header className="flex min-h-11 items-center justify-between px-p5 py-p5 text-app md:min-h-0 md:p-p10 md:px-p10 md:pb-4">
        <div className="flex min-w-0 items-center gap-p10 md:gap-3">
          <span className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent-primary)] uppercase">
            <Image
              src={isipiciLogo}
              alt="ISIPICI"
              width={96}
              height={24}
              className="h-5 w-auto md:h-6"
              priority
            />
          </span>
          <span className="h-5 w-px bg-bg3" />
          <span className="max-w-[42vw] truncate text-xs text-app-secondary md:max-w-none">
            {ownerName ?? "—"}
          </span>
        </div>

        <div className="flex items-center gap-p40">
          {!isMobile && (
            <div className="flex items-center gap-p20">
              <button disabled={!paymentReady} onClick={onNewPayment} className="btn-primary">
                <DollarSign className="h-4 w-4" strokeWidth={2} />
                <span>{t("topbar.payment")}</span>
              </button>
              <button onClick={onNewClient} className="btn-primary">
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                <span>{t("topbar.client")}</span>
              </button>

              <span className="h-5 w-px bg-bg3" />

              <div className="relative" ref={businessMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={showBusinessMenu}
                  onClick={()=>setShowBusinessMenu(value=>!value)}
                  className="inline-flex items-center gap-p10 rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1"
                  style={{backgroundColor:"var(--color-bg-bg0)"}}
                >
                  <span>{t("topbar.more")}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showBusinessMenu?"rotate-180":""}`}
                    strokeWidth={2}
                  />
                </button>

                {showBusinessMenu&&(
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-p10 min-w-[260px] overflow-hidden rounded-br15 border border-n1 p-p5"
                    style={{backgroundColor:"var(--n)",boxShadow:"var(--shadow-lg)"}}
                  >
                    <button
                      role="menuitem"
                      className="flex w-full items-center rounded-br10 px-p20 py-p10 text-left fs-14 text-app hover:bg-bg1"
                      onClick={openPlans}
                    >
                      {t("topbar.plans")}
                    </button>
                    <button
                      role="menuitem"
                      className="flex w-full items-center rounded-br10 px-p20 py-p10 text-left fs-14 text-app hover:bg-bg1"
                      onClick={openCsv}
                    >
                      {t("topbar.csv")}
                    </button>
                    {modern&&(
                      <>
                        <button
                          role="menuitem"
                          className="flex w-full items-center rounded-br10 px-p20 py-p10 text-left fs-14 text-app hover:bg-bg1"
                          onClick={openTeam}
                        >
                          {t("topbar.team")}
                        </button>
                      </>
                    )}
                    <div className="my-p5 border-t border-n1" />
                    <div className="flex items-center justify-between gap-p10 px-p20 py-p10"><span className="fs-12 text-app-secondary">{t("topbar.language")}</span><LanguageSwitch compact/></div>
                    <div className="my-p5 border-t border-n1" />
                    <button
                      role="menuitem"
                      className="flex w-full items-center rounded-br10 px-p20 py-p10 text-left fs-14 text-danger"
                      onClick={askLogout}
                    >
                      {t("common.logout")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <button
              type="button"
              onClick={() => setShowSheet(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-bg2"
              aria-label={t("topbar.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {showSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end md:hidden bg-black/60"
          onClick={() => setShowSheet(false)}
        >
          <div
            className="w-full bg-bg0 rounded-t-2xl p-p20 pb-p10 shadow-lg flex flex-col gap-p10 transform translate-y-0 animate-[sheet-up_200ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="fs-12 text-app-secondary">{t("topbar.current")}</p>
              <p className="fs-16 text-app font-semibold mt-p5">{ownerName ?? "—"}</p>
            </div>

            <div className="space-y-p10">
              <button
                disabled={!paymentReady}
                onClick={() => {
                  setShowSheet(false);
                  if(paymentReady)onNewPayment();
                }}
                className="w-full btn-primary justify-center py-p10 fs-14"
              >
                <DollarSign className="h-4 w-4" strokeWidth={2} />
                <span>{t("topbar.payment")}</span>
              </button>

              <button
                onClick={() => {
                  setShowSheet(false);
                  onNewClient();
                }}
                className="w-full btn-primary justify-center py-p10 fs-14"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                <span>{t("topbar.client")}</span>
              </button>
            </div>

            <div className="border-t border-n1 pt-p20">
              <div className="mb-p10 flex items-center justify-between gap-p10"><p className="fs-12 font-medium text-app-secondary">{t("topbar.more")}</p><LanguageSwitch compact/></div>
              <div className="overflow-hidden rounded-br15 border border-n1" style={{backgroundColor:"var(--n)"}}>
                <button className="w-full border-b border-n1 px-p20 py-p10 text-left fs-14 text-app" onClick={openPlans}>{t("topbar.plans")}</button>
                <button className={`w-full px-p20 py-p10 text-left fs-14 text-app ${modern?"border-b border-n1":""}`} onClick={openCsv}>{t("topbar.csv")}</button>
                {modern&&<>
                  <button className="w-full border-b border-n1 px-p20 py-p10 text-left fs-14 text-app" onClick={openTeam}>{t("topbar.team")}</button>
                </>}
              </div>
            </div>

            <button
              onClick={askLogout}
              className="w-full rounded-full border px-p20 py-p10 text-center fs-14 font-medium text-danger"
              style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}
            >
              {t("common.logout")}
            </button>
          </div>
        </div>
      )}

      {showCsv&&<ClientCsvModal onClose={()=>setShowCsv(false)} onImported={()=>onClientsImported?.()}/>}
      {showPlans&&<PlansModal onClose={()=>setShowPlans(false)}/>}
      {showTeam&&<TeamAccessModal onClose={()=>setShowTeam(false)}/>}
      <ConfirmDialog
        open={confirmLogout}
        title={t("topbar.logoutTitle")}
        message={t("topbar.logoutMessage")}
        confirmLabel={t("common.logout")}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void handleLogout();
        }}
      />
    </>
  );
}

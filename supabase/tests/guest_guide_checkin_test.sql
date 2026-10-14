-- Disposable test database only: fixture and controlled opening date roll back together.
begin;
do $$
declare v_id uuid; entry_token uuid; request1 uuid:=gen_random_uuid(); request2 uuid:=gen_random_uuid();
  hash text:=repeat('7',64); stamp timestamptz; receipt jsonb;
begin
  update privacy_state set retention_until=now()+interval '1 day';
  insert into rsvp(name,phone,side,attending,checkin_token) values('Guide Test','010-9191-8181','groom',true,gen_random_uuid())
    returning rsvp.id,checkin_token into v_id,entry_token;
  perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',null,null,hash,now());
  if not exists(select 1 from rsvp r where r.id=v_id and r.guide_token_hash=hash and r.guide_confirmed_at is null and r.checkin_token=entry_token) then raise exception 'prepare mutated confirmation or entry QR'; end if;
  if exists(select 1 from checkins where rsvp_id=v_id) then raise exception 'prepare created arrival'; end if;

  if now()<'2026-10-15 00:00:00+09' then
    begin perform confirm_guest_guide_v1(hash); raise exception 'confirmed early';
    exception when raise_exception then if sqlerrm<>'guide_not_open' then raise; end if; end;
  end if;
  -- Only replace the uncontrollable wall-clock opening date inside this rolled-back fixture.
  execute replace(pg_get_functiondef('confirm_guest_guide_v1(text)'::regprocedure),'2026-10-15 00:00:00+09','2000-01-01 00:00:00+09');
  stamp:=confirm_guest_guide_v1(hash);
  if stamp is null then raise exception 'missing confirmation'; end if;
  stamp:=stamp-interval '1 hour';
  update rsvp set guide_confirmed_at=stamp where rsvp.id=v_id;
  if confirm_guest_guide_v1(hash)<>stamp then raise exception 'not idempotent'; end if;
  if exists(select 1 from checkins where rsvp_id=v_id) then raise exception 'guide confirmation counted as arrival'; end if;
  begin perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,null,hash,now(),request1,false); raise exception 'sent to confirmed guest without acknowledgement';
  exception when raise_exception then if sqlerrm<>'resend_confirmation_required' then raise; end if; end;
  perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,null,hash,now(),request1,true);
  begin perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,null,hash,now(),request2,true); raise exception 'concurrent request replaced claim';
  exception when raise_exception then if sqlerrm<>'targets_changed' then raise; end if; end;
  begin perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,request1,hash,now(),request2,true); raise exception 'in progress resent';
  exception when raise_exception then if sqlerrm<>'send_in_progress' then raise; end if; end;
  perform complete_guest_guide_sms_v1(v_id,request1,'unknown');
  begin perform complete_guest_guide_sms_v1(v_id,request2,'accepted'); raise exception 'wrong request completed';
  exception when raise_exception then if sqlerrm<>'request_changed' then raise; end if; end;
  begin perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,request1,hash,now(),request2,false); raise exception 'uncertain automatically retried';
  exception when raise_exception then if sqlerrm<>'resend_confirmation_required' then raise; end if; end;
  perform issue_guest_guide_v1(v_id,'Guide Test','01091918181',hash,request1,hash,now(),request2,true);
  perform complete_guest_guide_sms_v1(v_id,request2,'accepted');
  if not exists(select 1 from rsvp r where r.id=v_id and r.guide_sms_status='accepted' and r.guide_sms_sent_at is not null and r.checkin_token=entry_token) then raise exception 'send state or QR changed'; end if;
  update rsvp set phone='010-9191-8282' where rsvp.id=v_id;
  if not exists(select 1 from rsvp r where r.id=v_id and r.guide_token_hash is null and r.guide_confirmed_at is null and r.guide_sms_status is null) then raise exception 'phone change did not revoke'; end if;
  begin perform confirm_guest_guide_v1(hash); raise exception 'revoked link accepted';
  exception when raise_exception then if sqlerrm<>'invalid_token' then raise; end if; end;
  update rsvp set attending=false where rsvp.id=v_id;
  begin perform issue_guest_guide_v1(v_id,'Guide Test','01091918282',null,null,hash,now()); raise exception 'non attendee accepted';
  exception when raise_exception then if sqlerrm<>'not_attending' then raise; end if; end;
  update rsvp set attending=true where rsvp.id=v_id;
  perform issue_guest_guide_v1(v_id,'Guide Test','01091918282',null,null,hash,now());
  perform confirm_guest_guide_v1(hash);
  update privacy_state set retention_until=now()-interval '1 second';
  receipt:=purge_operational_privacy_v1(privacy_preview_v1()->>'fingerprint');
  if exists(select 1 from rsvp r where r.id=v_id) then raise exception 'guide metadata survived purge'; end if;
  if receipt::text like '%0109191%' or receipt::text like '%Guide Test%' then raise exception 'personal receipt'; end if;
end $$;
rollback;

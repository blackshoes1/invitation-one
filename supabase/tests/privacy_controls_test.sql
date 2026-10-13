-- Disposable database only. Everything rolls back, including the purge.
begin;
do $$
declare g uuid; d uuid; p uuid; private_p uuid; photo uuid; rv uuid;
  c uuid; t text; r jsonb; preview jsonb; receipt jsonb; n integer;
begin
  update privacy_state set retention_until=now()+interval '1 day';
  insert into groups(name,slug) values('Privacy test','privacy-test') returning id into g;
  insert into group_members(group_id,name,phone,companions) values(g,'Test Person','010-1111-2222',array['Companion']);
  insert into deliveries(group_id,location,date,time_slot,status,review_text,met_photo_url)
    values(g,'Private address','2026-09-10','오후','완료','Preserved delivery review','https://example.invalid/delivery.jpg') returning id into d;
  insert into participants(delivery_id,group_id,type,name,phone,is_owner,message)
    values(d,g,'직접배달','Test Person','010-1111-2222',true,'Public congratulations') returning id into p;
  insert into participants(group_id,type,name,phone,message,is_private)
    values(g,'마음배송','Private Person','010-1111-3333','Private congratulations',true) returning id into private_p;
  insert into guest_photos(url,path,name,message,approved)
    values('https://example.invalid/photo.jpg','test/photo.jpg','Photo Person','Photo message',false) returning id into photo;
  insert into waiting_list(name,phone) values('Waiting Person','010-1111-4444');

  -- Unknown names receive unusable challenges, even with a matching code.
  c:=gen_random_uuid();
  if create_guest_identity_challenge_v1(c,'badge','Missing Person','01011112222',repeat('a',64),repeat('b',64),repeat('c',64)) is not null then raise exception 'enumeration'; end if;
  if (consume_guest_identity_code_v1(c,repeat('c',64),repeat('d',64))->>'ok')::boolean then raise exception 'unknown accepted'; end if;

  -- Five wrong attempts permanently exhaust a challenge; null does not bypass verification.
  c:=gen_random_uuid();
  perform create_guest_identity_challenge_v1(c,'badge','Test Person','01011112222',repeat('a',64),repeat('b',64),repeat('c',64));
  for n in 1..5 loop
    r:=consume_guest_identity_code_v1(c,null,repeat('d',64));
    if (r->>'ok')::boolean then raise exception 'null code accepted'; end if;
  end loop;
  if (consume_guest_identity_code_v1(c,repeat('c',64),repeat('d',64))->>'ok')::boolean then raise exception 'exhausted accepted'; end if;

  c:=gen_random_uuid(); t:=repeat('e',64);
  perform create_guest_identity_challenge_v1(c,'badge','Test Person','01011112222',repeat('a',64),repeat('b',64),repeat('c',64));
  r:=consume_guest_identity_code_v1(c,repeat('c',64),t);
  if not (r->>'ok')::boolean or r->'result'->>'participant_id'<>p::text then raise exception 'badge binding'; end if;
  if r::text like '%010%' then raise exception 'phone disclosed'; end if;
  if (consume_guest_identity_code_v1(c,repeat('c',64),repeat('f',64))->>'ok')::boolean then raise exception 'replayed code'; end if;
  begin
    perform submit_rsvp_verified_v1(t,repeat('a',64),repeat('b',64),'Test Person','01011112222','groom',true,0,0,false,'yes',null);
    raise exception 'wrong purpose accepted';
  exception when raise_exception then if sqlerrm<>'identity_required' then raise; end if; end;
  update participants set phone='010-1111-9999' where id=p;
  if exists(select 1 from guest_identity_tickets where token_hash=t) then raise exception 'phone change did not revoke'; end if;

  -- RSVP submission is bound to verified hashes and atomically consumes its ticket.
  c:=gen_random_uuid(); t:=repeat('f',64);
  perform create_guest_identity_challenge_v1(c,'rsvp','Rsvp Person','01011115555',repeat('a',64),repeat('b',64),repeat('c',64));
  perform consume_guest_identity_code_v1(c,repeat('c',64),t);
  begin
    perform submit_rsvp_verified_v1(t,null,repeat('b',64),'Rsvp Person','01011115555','groom',true,0,0,false,'yes',null);
    raise exception 'null identity accepted';
  exception when raise_exception then if sqlerrm<>'identity_required' then raise; end if; end;
  r:=submit_rsvp_verified_v1(t,repeat('a',64),repeat('b',64),'Rsvp Person','01011115555','groom',true,0,0,false,'yes','Private RSVP congratulations');
  rv:=(r->>'rsvp_id')::uuid;
  if r->>'result'<>'inserted' then raise exception 'rsvp not inserted'; end if;
  begin
    perform submit_rsvp_verified_v1(t,repeat('a',64),repeat('b',64),'Rsvp Person','01011115555','groom',true,0,0,false,'yes',null);
    raise exception 'ticket replay accepted';
  exception when raise_exception then if sqlerrm<>'identity_required' then raise; end if; end;
  c:=gen_random_uuid();
  perform create_guest_identity_challenge_v1(c,'checkin','Rsvp Person','01011115555',repeat('a',64),repeat('b',64),repeat('c',64));
  perform consume_guest_identity_code_v1(c,repeat('c',64),repeat('9',64));
  if not exists(select 1 from guest_identity_tickets where token_hash=repeat('9',64) and rsvp_id=rv and purpose='checkin') then raise exception 'checkin binding'; end if;

  if exists(select 1 from privacy_access_log where resource in ('participants','rsvp') and (action like '%010%' or resource like '%Person%')) then raise exception 'PII audit'; end if;
  if has_table_privilege('service_role','privacy_access_log','delete') or has_table_privilege('anon','guest_identity_tickets','select') then raise exception 'permissions'; end if;
  begin perform purge_operational_privacy_v1(privacy_preview_v1()->>'fingerprint'); raise exception 'early purge';
  exception when raise_exception then if sqlerrm<>'retention_not_expired' then raise; end if; end;

  update privacy_state set retention_until=now()-interval '1 second';
  begin insert into waiting_list(name,phone) values('Late Person','01011116666'); raise exception 'late insert';
  exception when raise_exception then if sqlerrm<>'collection_closed' then raise; end if; end;
  begin update participants set name='Late Rename' where id=p; raise exception 'late update';
  exception when raise_exception then if sqlerrm<>'collection_closed' then raise; end if; end;
  begin perform purge_operational_privacy_v1(repeat('0',64)); raise exception 'stale preview';
  exception when raise_exception then if sqlerrm<>'targets_changed' then raise; end if; end;
  preview:=privacy_preview_v1();
  receipt:=purge_operational_privacy_v1(preview->>'fingerprint');
  if exists(select 1 from participants) or exists(select 1 from group_members) or exists(select 1 from deliveries)
    or exists(select 1 from rsvp) or exists(select 1 from waiting_list) or exists(select 1 from guest_identity_tickets)
    or exists(select 1 from privacy_consents) or exists(select 1 from notification_outbox) then raise exception 'incomplete purge'; end if;
  if not exists(select 1 from guest_photos where id=photo and name is null and url='https://example.invalid/photo.jpg' and not approved) then raise exception 'photo changed'; end if;
  if not exists(select 1 from guest_memories where id=p and message='Public congratulations' and review='Preserved delivery review' and photo_url is not null and name='하객') then raise exception 'memory lost'; end if;
  if not exists(select 1 from guest_memories where id=rv and message='Private RSVP congratulations' and is_private) then raise exception 'rsvp memory lost'; end if;
  if not exists(select 1 from get_celebrations() where id=p and name='하객' and area is null and date is null) then raise exception 'public memory missing'; end if;
  if exists(select 1 from get_celebrations() where id in (private_p,rv)) then raise exception 'private memory leaked'; end if;
  if receipt::text like '%010%' or receipt::text like '%Private address%' then raise exception 'PII receipt'; end if;
  if purge_operational_privacy_v1('replayed')<>receipt then raise exception 'purge not idempotent'; end if;
  perform complete_privacy_external_check_v1('local_copies',true);
  perform cleanup_privacy_security_state_v1();
end $$;
rollback;
